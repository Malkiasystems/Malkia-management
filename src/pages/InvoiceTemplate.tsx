import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ── LOGO ─────────────────────────────────────
const MALKIA_LOGO = "data:image/jpeg;base64,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"

// ── TYPES ─────────────────────────────────────
interface InvoiceSettings {
  company_name: string
  tagline: string
  address: string
  city: string
  phone: string
  email: string
  website: string
  tin: string
  vrn: string
  primary_color: string
  bank_name: string
  bank_account_name: string
  bank_account_number: string
  bank_branch: string
  show_bank_details: boolean
  show_salesperson: boolean
  show_vat_breakdown: boolean
  show_outstanding_balance: boolean
  show_payment_terms: boolean
  show_notes: boolean
  footer_note: string
  payment_note: string
}

interface InvoiceVoucher {
  ref: string
  posting_date: string
  due_date: string
  payment_terms: string
  total_amount: number
  vat_amount: number
  subtotal: number
  notes: string
  posted_by: string
  customers: {
    name: string
    whatsapp: string
    address: string
    balance: number
  } | null
  voucher_lines: {
    qty: number
    unit_price: number
    total: number
    description: string
    products: { name: string; sku: string } | null
  }[]
}

const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  company_name: 'Malkia Wellness Group Ltd',
  tagline: 'Reimagining Motherhood',
  address: 'Dar es Salaam, Tanzania',
  city: 'Dar es Salaam',
  phone: '+255 700 000 000',
  email: 'hello@malkia.co.tz',
  website: 'www.malkia.co.tz',
  tin: '—',
  vrn: '—',
  primary_color: '#85c2be',
  bank_name: 'NMB Bank',
  bank_account_name: 'Malkia Wellness Group Ltd',
  bank_account_number: '22510074972',
  bank_branch: 'Dar es Salaam Branch',
  show_bank_details: true,
  show_salesperson: true,
  show_vat_breakdown: true,
  show_outstanding_balance: true,
  show_payment_terms: true,
  show_notes: true,
  footer_note: 'Thank you for your business. Payment is due by the date above.',
  payment_note: 'Please include the invoice number as payment reference.',
}

// ── INVOICE COMPONENT ─────────────────────────
export const MalkiaInvoice = ({ voucher, settings }: { voucher: InvoiceVoucher; settings: InvoiceSettings }) => {
  const s = settings
  const p = s.primary_color
  const cust = voucher.customers
  const vat = voucher.vat_amount || Math.round((voucher.total_amount || 0) * 18 / 118)
  const net = (voucher.total_amount || 0) - vat
  const outstanding = (cust?.balance || 0)
  const totalDue = (voucher.total_amount || 0) + outstanding

  return (
    <div id="malkia-invoice" style={{
      width: 680,
      background: '#ffffff',
      fontFamily: "'Instrument Sans', 'Helvetica Neue', sans-serif",
      color: '#1a1a1a',
      fontSize: 12,
    }}>

      {/* HEADER */}
      <div style={{ padding: '32px 40px 24px', borderBottom: `3px solid ${p}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>

          {/* Left — Logo + Company */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, maxWidth: '55%' }}>
            <img src={MALKIA_LOGO} alt="Malkia" style={{ height: 110, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: "'Syne', serif", fontSize: 24, fontWeight: 800, color: '#1a1a1a', letterSpacing: '-0.5px', lineHeight: 1.15 }}>{s.company_name}</div>
              <div style={{ fontSize: 11, color: p, fontStyle: 'italic', marginTop: 4 }}>{s.tagline}</div>
              <div style={{ fontSize: 10, color: '#888', marginTop: 6, fontFamily: "'DM Mono', monospace", lineHeight: 1.8 }}>
                {s.address} · {s.phone}<br/>
                {s.email} · {s.website}
              </div>
            </div>
          </div>

          {/* Right — Invoice details */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: "'Syne', serif", fontSize: 36, fontWeight: 800, color: p, letterSpacing: '-1px', lineHeight: 1 }}>INVOICE</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 600, color: '#1a1a1a', marginTop: 8 }}>{voucher.ref}</div>
            <div style={{ fontSize: 11, color: '#888', fontFamily: "'DM Mono', monospace", marginTop: 10, lineHeight: 2 }}>
              <div>Date: <span style={{ color: '#1a1a1a' }}>{voucher.posting_date}</span></div>
              {s.show_payment_terms && voucher.due_date && (
                <div>Due: <span style={{ color: '#c0392b', fontWeight: 600 }}>{voucher.due_date}</span></div>
              )}
              {s.show_payment_terms && voucher.payment_terms && (
                <div>Terms: <span style={{ color: '#1a1a1a' }}>{voucher.payment_terms}</span></div>
              )}
              {s.show_salesperson && voucher.posted_by && (
                <div>Sales Rep: <span style={{ color: '#1a1a1a' }}>{voucher.posted_by}</span></div>
              )}
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: '#aaa', fontFamily: "'DM Mono', monospace" }}>
              TIN: {s.tin} · VRN: {s.vrn}
            </div>
          </div>
        </div>
      </div>

      {/* BILL TO */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        <div style={{ padding: '20px 40px', borderRight: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: '#aaa', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, fontWeight: 600 }}>Bill To</div>
          <div style={{ fontFamily: "'Syne', serif", fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginBottom: 4 }}>{cust?.name || '—'}</div>
          {cust?.address && <div style={{ fontSize: 11, color: '#555', lineHeight: 1.6 }}>{cust.address}</div>}
          {cust?.whatsapp && <div style={{ fontSize: 11, color: '#888', fontFamily: "'DM Mono', monospace", marginTop: 4 }}>{cust.whatsapp}</div>}
        </div>

        {/* Outstanding balance */}
        {s.show_outstanding_balance && outstanding > 0 && (
          <div style={{ padding: '20px 40px', background: '#fff8f8' }}>
            <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: '#aaa', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, fontWeight: 600 }}>Account Summary</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', color: '#888' }}>
              <span>Previous Balance</span>
              <span style={{ fontFamily: "'DM Mono', monospace" }}>{outstanding.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', color: '#888' }}>
              <span>This Invoice</span>
              <span style={{ fontFamily: "'DM Mono', monospace" }}>{(voucher.total_amount||0).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', borderTop: '1px solid #f0d0d0', marginTop: 6 }}>
              <span style={{ fontWeight: 700, color: '#c0392b', fontSize: 12 }}>Total Due</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, fontSize: 14, color: '#c0392b' }}>TZS {totalDue.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>

      {/* TEAL DIVIDER */}
      <div style={{ height: 2, background: `linear-gradient(90deg, ${p} 0%, ${p}44 100%)`, margin: '0 40px' }}></div>

      {/* LINE ITEMS TABLE */}
      <div style={{ padding: '0 40px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 20 }}>
          <thead>
            <tr style={{ background: '#1a1a1a', color: '#fff' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontFamily: "'DM Mono', monospace", fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 500 }}>#</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontFamily: "'DM Mono', monospace", fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 500 }}>Item / Description</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', fontFamily: "'DM Mono', monospace", fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 500, width: 60 }}>Qty</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 500, width: 120 }}>Unit Price</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 500, width: 130 }}>Amount (TZS)</th>
            </tr>
          </thead>
          <tbody>
            {(voucher.voucher_lines || []).map((line, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f5f5f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{ padding: '10px 12px', fontFamily: "'DM Mono', monospace", color: p, fontSize: 11 }}>{String(i+1).padStart(2,'0')}</td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ fontWeight: 600, color: '#1a1a1a', fontSize: 12 }}>{line.products?.name || line.description || '—'}</div>
                  {line.products?.sku && <div style={{ fontSize: 10, color: '#aaa', fontFamily: "'DM Mono', monospace", marginTop: 2 }}>SKU: {line.products.sku}</div>}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'center', fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{line.qty}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{(line.unit_price||0).toLocaleString()}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{(line.total||0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* TOTALS + BANK */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, padding: '20px 40px 0' }}>

        {/* Bank details */}
        {s.show_bank_details && (
          <div style={{ paddingRight: 24 }}>
            <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: '#aaa', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10, fontWeight: 600 }}>Payment Details</div>
            <div style={{ background: `${p}10`, border: `1px solid ${p}30`, borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#1a1a1a', marginBottom: 6 }}>{s.bank_name}</div>
              <div style={{ fontSize: 11, color: '#555', lineHeight: 1.8, fontFamily: "'DM Mono', monospace" }}>
                <div>A/C Name: {s.bank_account_name}</div>
                <div>A/C No: <span style={{ fontWeight: 700, color: '#1a1a1a' }}>{s.bank_account_number}</span></div>
                <div>Branch: {s.bank_branch}</div>
              </div>
              {s.payment_note && <div style={{ fontSize: 10, color: p, marginTop: 8, fontStyle: 'italic' }}>{s.payment_note}</div>}
            </div>
          </div>
        )}

        {/* Totals */}
        <div style={{ borderLeft: '1px solid #f0f0f0', paddingLeft: 24 }}>
          <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: '#aaa', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10, fontWeight: 600 }}>Invoice Summary</div>
          {s.show_vat_breakdown && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 0', color: '#888' }}>
                <span>Net Amount (excl. VAT)</span>
                <span style={{ fontFamily: "'DM Mono', monospace" }}>{net.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 0', color: '#888' }}>
                <span>VAT (18% inclusive)</span>
                <span style={{ fontFamily: "'DM Mono', monospace" }}>{vat.toLocaleString()}</span>
              </div>
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 0', borderTop: `2px solid ${p}`, marginTop: 6 }}>
            <span style={{ fontFamily: "'Syne', serif", fontSize: 13, fontWeight: 700 }}>Invoice Total</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 800, color: p }}>TZS {(voucher.total_amount||0).toLocaleString()}</span>
          </div>
          {s.show_outstanding_balance && outstanding > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#c0392b' }}>Total Amount Due</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 800, color: '#c0392b' }}>TZS {totalDue.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* NOTES */}
      {s.show_notes && voucher.notes && (
        <div style={{ margin: '20px 40px 0', padding: '12px 14px', background: '#f9f9f9', borderLeft: `3px solid ${p}`, borderRadius: '0 6px 6px 0' }}>
          <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: '#aaa', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 5, fontWeight: 600 }}>Notes</div>
          <div style={{ fontSize: 11, color: '#555', lineHeight: 1.6 }}>{voucher.notes}</div>
        </div>
      )}

      {/* FOOTER */}
      <div style={{ margin: '24px 40px 0', padding: '16px 0', borderTop: `1px solid ${p}40`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: "'Syne', serif", fontSize: 13, fontWeight: 700, color: p }}>{s.company_name}</div>
          <div style={{ fontSize: 10, color: '#aaa', marginTop: 2, fontFamily: "'DM Mono', monospace" }}>{s.website} · {s.email}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#bbb', fontStyle: 'italic' }}>{s.footer_note}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: '#bbb', fontFamily: "'DM Mono', monospace" }}>TIN: {s.tin}</div>
          <div style={{ fontSize: 9, color: '#bbb', fontFamily: "'DM Mono', monospace" }}>VRN: {s.vrn}</div>
        </div>
      </div>

      {/* Bottom color bar */}
      <div style={{ height: 6, background: `linear-gradient(90deg, ${p} 0%, #f7a6ad 100%)`, marginTop: 16 }}></div>
    </div>
  )
}

// ── INVOICE TEMPLATE PAGE ─────────────────────
export default function InvoiceTemplatePage() {
  const [settings, setSettings] = useState<InvoiceSettings>(DEFAULT_INVOICE_SETTINGS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<'preview' | 'settings'>('preview')

  const SAMPLE: InvoiceVoucher = {
    ref: 'INV-0001', posting_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30*86400000).toISOString().split('T')[0],
    payment_terms: 'NET30', notes: 'Kindly process payment by due date. For queries contact accounts@malkia.co.tz',
    total_amount: 520000, vat_amount: 75000, subtotal: 445000,
    posted_by: 'Lilian Mallya',
    customers: { name: 'Aga Khan Hospital DSM', whatsapp: '+255 22 211 5151', address: 'Ocean Road, Dar es Salaam', balance: 185000 },
    voucher_lines: [
      { qty: 10, unit_price: 32000, total: 320000, description: 'Nipple Cream', products: { name: 'Nipple Cream', sku: 'MK-007' } },
      { qty: 4, unit_price: 50000, total: 200000, description: 'Prenatal Bundle', products: { name: 'Prenatal Bundle', sku: 'MK-008' } },
    ],
  }

  useEffect(() => { loadSettings() }, [])

  const loadSettings = async () => {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'invoice_template').single()
    if (data?.value) {
      try { setSettings({ ...DEFAULT_INVOICE_SETTINGS, ...JSON.parse(data.value) }) } catch {}
    }
  }

  const save = async () => {
    setSaving(true)
    await supabase.from('system_settings').upsert({ key: 'invoice_template', value: JSON.stringify(settings) }, { onConflict: 'key' })
    setSaved(true); setTimeout(() => setSaved(false), 2000); setSaving(false)
  }

  const set = (k: keyof InvoiceSettings, v: string | boolean) => setSettings(s => ({ ...s, [k]: v }))

  const printInvoice = () => {
    const el = document.getElementById('malkia-invoice')
    if (!el) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${SAMPLE.ref}</title>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@300;400;500&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">
      <style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;justify-content:center;padding:20px;background:#f0f0f0}@media print{body{background:#fff;padding:0}}</style>
    </head><body>${el.outerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 600)
  }

  const Toggle = ({ label, desc, k }: { label: string; desc: string; k: keyof InvoiceSettings }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
      <div><div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div><div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{desc}</div></div>
      <div onClick={() => set(k, !settings[k as keyof InvoiceSettings])} style={{ width: 44, height: 24, background: settings[k as keyof InvoiceSettings] ? 'var(--green)' : 'var(--surface3)', borderRadius: 12, cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0, marginLeft: 16 }}>
        <div style={{ position: 'absolute', top: 2, left: settings[k as keyof InvoiceSettings] ? 22 : 2, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.2)' }}></div>
      </div>
    </div>
  )

  const Field = ({ label, k, placeholder, multiline }: { label: string; k: keyof InvoiceSettings; placeholder?: string; multiline?: boolean }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>{label}</div>
      {multiline
        ? <textarea className="form-input" rows={2} style={{ resize: 'none', fontSize: 12 }} value={String(settings[k])} onChange={e => set(k, e.target.value)} placeholder={placeholder} />
        : <input className="form-input" style={{ fontSize: 12 }} value={String(settings[k])} onChange={e => set(k, e.target.value)} placeholder={placeholder} />
      }
    </div>
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Sales Invoice Template</div>
          <div className="page-sub">B2B invoice · Classic layout · Malkia branded · Print & PDF ready</div>
        </div>
        <div className="page-actions">
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 4 }}>
            {(['preview', 'settings'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)} style={{ padding: '7px 18px', fontSize: 12, fontWeight: 600, background: activeTab === t ? 'var(--accent)' : 'transparent', color: activeTab === t ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer', borderRadius: 'var(--r)', transition: 'all .15s', textTransform: 'capitalize' }}>{t}</button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={printInvoice}>Print / PDF</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}</button>
        </div>
      </div>

      {activeTab === 'preview' ? (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, overflowX: 'auto' }}>
            <MalkiaInvoice voucher={SAMPLE} settings={settings} />
          </div>
          <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>Quick Toggles</div>
              <Toggle label="Bank Details" desc="Show payment account info" k="show_bank_details" />
              <Toggle label="VAT Breakdown" desc="Net + VAT separately" k="show_vat_breakdown" />
              <Toggle label="Outstanding Balance" desc="Previous balance + total due" k="show_outstanding_balance" />
              <Toggle label="Payment Terms" desc="Due date and terms" k="show_payment_terms" />
              <Toggle label="Salesperson" desc="Show sales rep name" k="show_salesperson" />
              <Toggle label="Notes" desc="Invoice notes field" k="show_notes" />
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 10 }}>Brand Color</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={settings.primary_color} onChange={e => set('primary_color', e.target.value)} style={{ width: 40, height: 32, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} />
                <input className="form-input" style={{ flex: 1, fontSize: 12, fontFamily: 'var(--mono)' }} value={settings.primary_color} onChange={e => set('primary_color', e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid g2" style={{ gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Company Details</div>
              <Field label="Company Name" k="company_name" />
              <Field label="Tagline" k="tagline" />
              <Field label="Address" k="address" />
              <div className="form-row">
                <Field label="Phone" k="phone" />
                <Field label="Email" k="email" />
              </div>
              <div className="form-row">
                <Field label="Website" k="website" />
                <Field label="TIN" k="tin" />
              </div>
              <Field label="VRN" k="vrn" />
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Footer & Notes</div>
              <Field label="Footer Note" k="footer_note" multiline />
              <Field label="Payment Note (on bank details)" k="payment_note" multiline />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Bank Details</div>
              <Field label="Bank Name" k="bank_name" placeholder="NMB Bank" />
              <Field label="Account Name" k="bank_account_name" />
              <Field label="Account Number" k="bank_account_number" />
              <Field label="Branch" k="bank_branch" />
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>Visibility</div>
              <Toggle label="Bank Details" desc="Show payment account on invoice" k="show_bank_details" />
              <Toggle label="VAT Breakdown" desc="Show net + VAT separately" k="show_vat_breakdown" />
              <Toggle label="Outstanding Balance" desc="Previous balance and total due" k="show_outstanding_balance" />
              <Toggle label="Payment Terms" desc="Due date and terms" k="show_payment_terms" />
              <Toggle label="Salesperson Name" desc="Show who raised the invoice" k="show_salesperson" />
              <Toggle label="Notes Section" desc="Invoice notes field" k="show_notes" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
