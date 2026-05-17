// ─── Customer Statement ────────────────────────────────────────────────────
// A full accounting statement for a single customer: opening balance,
// chronological ledger of every invoice / receipt / credit note / debit note
// within a date range, running balance column, closing balance, and
// export-to-PDF / PNG / WhatsApp actions.
//
// This is the "where does this customer stand with us?" view — the canonical
// artifact for collections, audits, and customer disputes.
// ───────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs, today } from '../lib/utils'
import { loadWAConfig, sendWhatsApp } from '../lib/whatsapp'
import type { WAConfig } from '../lib/whatsapp'
import type { Page } from '../lib/types'
import Toast from '../components/Toast'

interface Props {
  customerId: string
  onNav: (p: Page) => void
}

interface DBCustomer {
  id: string; name: string; company: string | null
  contact_person: string | null; customer_number: string
  whatsapp: string | null; address: string | null
  balance: number; credit_limit: number; credit_period: number
  payment_terms: string | null
}

interface LedgerRow {
  id: string
  posting_date: string
  document_type: string   // 'invoice' | 'receipt' | 'credit_note' | 'debit_note' | 'opening' | 'adjustment'
  document_ref: string
  description: string | null
  due_date: string | null
  amount: number          // signed: invoices positive, receipts/credits negative
  remaining_amount: number
  is_open: boolean
}

interface LedgerRowWithBalance extends LedgerRow {
  runningBalance: number   // cumulative balance after this row
}

// ─── Date range presets ───────────────────────────────────────────────────
// Stored as functions that return [from, to] ISO strings at call time.
// Avoids stale dates if the user leaves the page open overnight.

const DATE_PRESETS = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 3 months', days: 90 },
  { label: 'Last 6 months', days: 180 },
  { label: 'Last 12 months', days: 365 },
  { label: 'All time', days: -1 },
] as const

function presetRange(days: number): { from: string; to: string } {
  const to = today()
  if (days < 0) return { from: '2000-01-01', to }   // "all time" = very old from date
  const d = new Date()
  d.setDate(d.getDate() - days)
  return { from: d.toISOString().split('T')[0], to }
}

// ─── Doc-type label + color helpers ───────────────────────────────────────
// Each ledger row type gets a recognisable chip color so the eye can
// scan quickly: debits (invoices, debit notes) in red-ish, credits
// (receipts, credit notes) in green-ish, neutral in gray.

function docLabel(type: string): string {
  switch (type) {
    case 'invoice':     return 'Invoice'
    case 'receipt':     return 'Receipt'
    case 'credit_note': return 'Credit Note'
    case 'debit_note':  return 'Debit Note'
    case 'opening':     return 'Opening'
    case 'payment':     return 'Payment'
    case 'adjustment':  return 'Adjustment'
    default:            return type
  }
}
function docColor(type: string): { bg: string; fg: string } {
  switch (type) {
    case 'invoice':     return { bg: 'rgba(239,68,68,.12)', fg: '#ef4444' }
    case 'debit_note':  return { bg: 'rgba(239,68,68,.12)', fg: '#ef4444' }
    case 'receipt':     return { bg: 'rgba(34,197,94,.12)', fg: '#22c55e' }
    case 'credit_note': return { bg: 'rgba(34,197,94,.12)', fg: '#22c55e' }
    case 'opening':     return { bg: 'rgba(148,163,184,.15)', fg: '#94a3b8' }
    default:            return { bg: 'var(--surface2)', fg: 'var(--text3)' }
  }
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function CustomerStatement({ customerId, onNav }: Props) {
  const [customer, setCustomer] = useState<DBCustomer | null>(null)
  const [rows, setRows] = useState<LedgerRowWithBalance[]>([])
  const [openingBalance, setOpeningBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<{ from: string; to: string }>(() => presetRange(90))
  const [activePreset, setActivePreset] = useState<number | null>(90)    // which preset is highlighted (by days)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [waConfig, setWaConfig] = useState<WAConfig | null>(null)
  const [sendingWA, setSendingWA] = useState(false)

  useEffect(() => {
    loadCustomer()
    loadWAConfig().then(setWaConfig)
  }, [customerId])

  useEffect(() => {
    if (customer) loadLedger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer, range.from, range.to])

  // ─── Data loaders ──────────────────────────────────────────────────────

  const loadCustomer = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('customers')
      .select('id, name, company, contact_person, customer_number, whatsapp, address, balance, credit_limit, credit_period, payment_terms')
      .eq('id', customerId)
      .single()
    if (error || !data) {
      setToast('Could not load customer')
      setToastType('error')
      setLoading(false)
      return
    }
    setCustomer(data)
  }

  // The ledger load is two queries:
  //   1) Sum of all entries BEFORE the from-date → the "opening balance" for
  //      the statement period.
  //   2) All entries WITHIN the date range → the body rows.
  // Running balance starts at opening and accumulates row-by-row.
  const loadLedger = async () => {
    setLoading(true)

    // 1. Opening balance = sum of all entries strictly before range.from
    const { data: priorRows } = await supabase
      .from('customer_ledger_entries')
      .select('amount')
      .eq('customer_id', customerId)
      .lt('posting_date', range.from)

    const opening = (priorRows || []).reduce((s, r) => s + (r.amount || 0), 0)
    setOpeningBalance(opening)

    // 2. Rows within the date range, oldest first for running balance calc
    const { data: inRangeRows, error } = await supabase
      .from('customer_ledger_entries')
      .select('id, posting_date, document_type, document_ref, description, due_date, amount, remaining_amount, is_open')
      .eq('customer_id', customerId)
      .gte('posting_date', range.from)
      .lte('posting_date', range.to)
      .order('posting_date', { ascending: true })
      .order('id', { ascending: true })    // tie-breaker: stable within same date

    if (error) {
      console.error('[statement] ledger load failed:', error.message)
      setToast('Could not load ledger'); setToastType('error')
      setLoading(false); return
    }

    // Compute running balance on the client. Starts at opening and adds each
    // row's signed amount (invoices + positive, receipts/credits negative).
    let running = opening
    const withBalance: LedgerRowWithBalance[] = (inRangeRows || []).map(r => {
      running += (r.amount || 0)
      return { ...r, runningBalance: running }
    })
    setRows(withBalance)
    setLoading(false)
  }

  // ─── Date range handlers ───────────────────────────────────────────────

  const applyPreset = (days: number) => {
    setRange(presetRange(days))
    setActivePreset(days)
  }
  const setCustomFrom = (from: string) => {
    setRange(r => ({ ...r, from }))
    setActivePreset(null)
  }
  const setCustomTo = (to: string) => {
    setRange(r => ({ ...r, to }))
    setActivePreset(null)
  }

  // ─── Stats (derived from loaded rows) ──────────────────────────────────

  const totalInvoiced = rows
    .filter(r => r.document_type === 'invoice' || r.document_type === 'debit_note')
    .reduce((s, r) => s + r.amount, 0)
  const totalPaid = rows
    .filter(r => r.document_type === 'receipt' || r.document_type === 'credit_note')
    .reduce((s, r) => s + Math.abs(r.amount), 0)
  const closingBalance = rows.length > 0 ? rows[rows.length - 1].runningBalance : openingBalance

  // ─── Export actions ────────────────────────────────────────────────────

  const printStatement = () => {
    const el = document.getElementById('customer-statement')
    if (!el || !customer) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Statement — ${customer.company || customer.name}</title>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@600&display=swap" rel="stylesheet">
      <style>
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        body{padding:20px;background:#f0f0f0;font-family:'Instrument Sans',sans-serif}
        *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important}
        @media print{
          body{background:#fff;padding:0;display:block}
          .no-print{display:none !important}
          @page{size:A4;margin:10mm}
        }
      </style>
    </head><body>${el.outerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 600)
  }

  const downloadPNG = () => {
    const el = document.getElementById('customer-statement')
    if (!el || !customer) return
    setToast('Generating image…'); setToastType('success')
    const existing = (window as any).html2canvas
    const generate = () => {
      const fullWidth = el.scrollWidth || el.offsetWidth
      const fullHeight = el.scrollHeight || el.offsetHeight
      ;(window as any).html2canvas(el, {
        scale: 1.5, useCORS: true, backgroundColor: '#ffffff',
        width: fullWidth, height: fullHeight,
        windowWidth: fullWidth, windowHeight: fullHeight,
        scrollX: 0, scrollY: 0,
      }).then((canvas: HTMLCanvasElement) => {
        const link = document.createElement('a')
        link.download = `Statement-${customer.customer_number}-${range.to}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()
        setToast('Image downloaded'); setToastType('success')
      }).catch(() => { setToast('Image generation failed'); setToastType('error') })
    }
    if (existing) { generate(); return }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
    script.onload = generate
    script.onerror = () => { setToast('Could not load image library'); setToastType('error') }
    document.body.appendChild(script)
  }

  const sendStatementWA = async () => {
    if (!customer?.whatsapp || !waConfig) return
    setSendingWA(true)
    const greeting = customer.contact_person
      ? `Hi ${customer.contact_person.split(' ')[0]},`
      : `Hi,`
    const body = closingBalance > 0
      ? `Your account statement as of ${range.to}:\n\n*Opening Balance:* TZS ${openingBalance.toLocaleString()}\n*Total Billed:* TZS ${totalInvoiced.toLocaleString()}\n*Total Paid:* TZS ${totalPaid.toLocaleString()}\n\n*Current Balance Owed:* TZS ${closingBalance.toLocaleString()}\n\nPlease settle at your earliest convenience.`
      : `Your account is up to date as of ${range.to}. Thank you for your business!`
    const msg = `${greeting}\n\n${body}\n\n— Malkia Wellness Group`
    const res = await sendWhatsApp(waConfig, {
      to: customer.whatsapp,
      message: msg,
      type: 'custom',
      ref: `STMT-${customer.customer_number}-${range.to}`,
      customer_name: customer.name,
      customer_id: customer.id,
      is_transactional: true,
    })
    setSendingWA(false)
    if (res.success) { setToast('Statement sent via WhatsApp'); setToastType('success') }
    else { setToast(res.error || 'WhatsApp send failed'); setToastType('error') }
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading && !customer) {
    return (
      <div className="page">
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading statement…</div>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="page">
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
          Customer not found. <button onClick={() => onNav('customers')} style={{ color: 'var(--accent)', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}>Back to Customers</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      {/* ── Action bar ──────────────────────────────────────────────────── */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => onNav('customers')}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Back to Customers">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>
          <div>
            <div className="page-title">Customer Statement</div>
            <div className="page-sub">{customer.company || customer.name} · {customer.customer_number}</div>
          </div>
        </div>
        <div className="page-actions">
          {customer.whatsapp && waConfig?.enabled && waConfig?.api_key && (
            <button className="btn btn-ghost btn-sm" disabled={sendingWA}
              onClick={sendStatementWA}
              style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#25D366', border: '1px solid rgba(37,211,102,.3)' }}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
              </svg>
              {sendingWA ? 'Sending…' : 'Send WhatsApp'}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={downloadPNG}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
            Save PNG
          </button>
          <button className="btn btn-primary" onClick={printStatement}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Print / PDF
          </button>
        </div>
      </div>

      {/* ── Date range toolbar (not printed) ───────────────────────────── */}
      <div className="no-print" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Period:</span>
        {DATE_PRESETS.map(p => (
          <button key={p.label} onClick={() => applyPreset(p.days)}
            style={{
              padding: '6px 12px', fontSize: 11, fontWeight: 600,
              border: `1px solid ${activePreset === p.days ? 'var(--accent)' : 'var(--border)'}`,
              background: activePreset === p.days ? 'var(--accent-dim)' : 'var(--surface)',
              color: activePreset === p.days ? 'var(--accent)' : 'var(--text3)',
              borderRadius: 6, cursor: 'pointer',
            }}>
            {p.label}
          </button>
        ))}
        <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />
        <input type="date" className="form-input" value={range.from}
          onChange={e => setCustomFrom(e.target.value)}
          style={{ width: 140, fontSize: 12 }} />
        <span style={{ color: 'var(--text3)', fontSize: 11 }}>to</span>
        <input type="date" className="form-input" value={range.to}
          onChange={e => setCustomTo(e.target.value)}
          style={{ width: 140, fontSize: 12 }} />
      </div>

      {/* ═════ PRINTABLE STATEMENT ═════════════════════════════════════ */}
      {/* Everything inside this div is what gets exported to PDF / PNG.    */}
      <div id="customer-statement" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '28px 32px' }}>

        {/* Statement header block */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid var(--border)', paddingBottom: 20, marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: -0.5, marginBottom: 4 }}>
              Malkia Wellness Group Ltd
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', lineHeight: 1.6 }}>
              Dar es Salaam, Tanzania · +255 745 555 999<br/>
              support@malkia.co.tz · www.malkia.co.tz<br/>
              TIN: 174-205-078
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Statement</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 800, color: 'var(--accent)', marginTop: 2 }}>
              {customer.customer_number}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>
              Period: <span style={{ color: 'var(--text2)' }}>{range.from}</span> → <span style={{ color: 'var(--text2)' }}>{range.to}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
              Generated: {today()}
            </div>
          </div>
        </div>

        {/* Customer block + at-a-glance stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Statement For</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>
              {customer.company || customer.name}
            </div>
            {customer.contact_person && (
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>Attn: {customer.contact_person}</div>
            )}
            {customer.address && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, lineHeight: 1.5 }}>{customer.address}</div>
            )}
            {customer.whatsapp && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>{customer.whatsapp}</div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, alignContent: 'start' }}>
            {[
              { label: 'Current Balance', val: tzs(customer.balance || 0), color: (customer.balance || 0) > 0 ? 'var(--red)' : 'var(--green)' },
              { label: 'Credit Limit', val: customer.credit_limit > 0 ? tzs(customer.credit_limit) : 'Unlimited' },
              { label: 'Payment Terms', val: customer.payment_terms || (customer.credit_period > 0 ? `${customer.credit_period} days` : 'COD') },
              { label: 'Transactions in Period', val: rows.length.toString() },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: s.color || 'var(--text)' }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Ledger table ──────────────────────────────────────────── */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, whiteSpace: 'nowrap' }}>Date</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Type</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Reference / Description</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Debit</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Credit</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {/* Opening balance row — always shown even if zero, so the reader
                  sees the math start somewhere. */}
              <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{range.from}</td>
                <td colSpan={2} style={{ padding: '10px 12px', fontSize: 11, fontStyle: 'italic', color: 'var(--text3)' }}>Opening balance (brought forward)</td>
                <td style={{ padding: '10px 12px' }}></td>
                <td style={{ padding: '10px 12px' }}></td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: openingBalance > 0 ? 'var(--red)' : openingBalance < 0 ? 'var(--green)' : 'var(--text3)' }}>
                  {openingBalance.toLocaleString()}
                </td>
              </tr>

              {/* Body rows */}
              {rows.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '30px 12px', textAlign: 'center', color: 'var(--text3)', fontStyle: 'italic', fontSize: 12 }}>
                  No transactions in this period.
                </td></tr>
              ) : (
                rows.map(r => {
                  const color = docColor(r.document_type)
                  const isDebit = r.amount > 0
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{r.posting_date}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: color.bg, color: color.fg, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                          {docLabel(r.document_type)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{r.document_ref}</div>
                        {r.description && (
                          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{r.description}</div>
                        )}
                        {r.due_date && r.is_open && (
                          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>Due: {r.due_date}</div>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--red)' }}>
                        {isDebit ? r.amount.toLocaleString() : ''}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--green)' }}>
                        {!isDebit ? Math.abs(r.amount).toLocaleString() : ''}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: r.runningBalance > 0 ? 'var(--red)' : r.runningBalance < 0 ? 'var(--green)' : 'var(--text3)' }}>
                        {r.runningBalance.toLocaleString()}
                      </td>
                    </tr>
                  )
                })
              )}

              {/* Closing balance summary row */}
              <tr style={{ borderTop: '2px solid var(--accent)', background: 'var(--surface2)' }}>
                <td style={{ padding: '14px 12px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{range.to}</td>
                <td colSpan={2} style={{ padding: '14px 12px', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Closing Balance</td>
                <td style={{ padding: '14px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>
                  {totalInvoiced > 0 && (
                    <>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>Period Total</div>
                      {totalInvoiced.toLocaleString()}
                    </>
                  )}
                </td>
                <td style={{ padding: '14px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>
                  {totalPaid > 0 && (
                    <>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>Period Total</div>
                      {totalPaid.toLocaleString()}
                    </>
                  )}
                </td>
                <td style={{ padding: '14px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800, color: closingBalance > 0 ? 'var(--red)' : closingBalance < 0 ? 'var(--green)' : 'var(--text3)' }}>
                  TZS {closingBalance.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer note */}
        <div style={{ marginTop: 24, padding: 14, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>Payment Details</div>
          <div style={{ color: 'var(--text2)' }}>
            NMB Bank · A/C: Malkia Wellness Group Ltd · A/C No: 22510074972 · Dar es Salaam Branch
          </div>
          <div style={{ marginTop: 6, fontStyle: 'italic' }}>
            Please reference the invoice number when making payment. For any queries, contact us on +255 745 555 999 or support@malkia.co.tz.
          </div>
        </div>

        {/* Signature line (visible in print only) */}
        <div style={{ marginTop: 28, fontSize: 10, color: 'var(--text3)', textAlign: 'center', fontStyle: 'italic' }}>
          Computer-generated statement · Reflects all transactions recorded as of {today()}
        </div>
      </div>
      {/* ═════ END PRINTABLE STATEMENT ════════════════════════════════ */}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
