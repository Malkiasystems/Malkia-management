import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { tzs, localIso } from '../lib/utils'
import { getCutoverDate, cutoverDateSync, clampFrom, cutoverNote } from '../lib/ledgerCutover'
import { printHtmlDocument } from '../lib/printDocument'

interface Account {
  id: string; code: string; name: string; type: string
  category: string; balance: number; is_active: boolean
}

interface LedgerEntry {
  id: string
  posting_date: string
  description: string
  debit: number
  credit: number
  voucher_ref: string
  voucher_type: string
  running_balance: number
}

const TYPE_COLOR: Record<string, string> = {
  asset: 'pill-blue', liability: 'pill-red', equity: 'pill-gray',
  revenue: 'pill-green', cogs: 'pill-amber', expense: 'pill-amber', other: 'pill-gray'
}

// Categories offered per type — mirrors what exists in the live chart today.
// Free-text override is allowed in the form for anything not listed.
const CATEGORIES_BY_TYPE: Record<string, string[]> = {
  asset: ['Cash & Bank', 'Receivables', 'Accounts Receivable', 'Inventory', 'Current Assets', 'Other Current Assets', 'Fixed Assets', 'Tax'],
  liability: ['Payables', 'Loans', 'Accruals', 'Payroll', 'Payroll Tax', 'Tax', 'Deferred Revenue', 'FX', 'Other Liabilities'],
  equity: ['Equity'],
  revenue: ['Revenue'],
  cogs: ['COGS'],
  expense: ['Operating Expenses', 'Salaries & Allowances', 'Premise', 'Utilities', 'Logistics', 'Fuel', 'Branding & Marketing', 'Technology', 'Office Consumables', 'Admin', 'Professional Fees', 'Compliance Fees', 'Internal Use', 'Miscellaneous'],
  other: ['Finance', 'FX', 'Tax', 'Other'],
}

const CODE_PREFIX: Record<string, string> = {
  asset: '1', liability: '2', equity: '3', revenue: '4', cogs: '5', expense: '6', other: '7',
}

const CASHFLOW_DEFAULT: Record<string, string> = {
  asset: 'operating', liability: 'operating', equity: 'financing',
  revenue: 'operating', cogs: 'operating', expense: 'operating', other: 'operating',
}

const VOUCHER_TYPE_LABEL: Record<string, string> = {
  cash_sale: 'Cash Sale', cash_payment: 'Payment', cash_receipt: 'Receipt',
  bank_transfer: 'Bank Transfer', grn: 'GRN', purchase_invoice: 'Purchase Inv',
  sales_invoice: 'Sales Inv', sales_return: 'Sales Return', purchase_return: 'Purch Return',
  petty_cash: 'Petty Cash', contra: 'Contra', journal: 'Journal',
  stock_adjustment: 'Stock Adj', opening_stock: 'Opening Stock',
  credit_note: 'Credit Note', debit_note: 'Debit Note',
}

// SVG icons
const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'back') return <svg {...p}><polyline points="15 18 9 12 15 6"/></svg>
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'export') return <svg {...p}><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.09"/></svg>
  if (n === 'pdf') return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
  if (n === 'excel') return <svg {...p}><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 3v18M2 9h20M2 15h20"/></svg>
  if (n === 'search') return <svg {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
  if (n === 'ledger') return <svg {...p}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
  if (n === 'calendar') return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
  if (n === 'print') return <svg {...p}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
  if (n === 'plus') return <svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Ledger state
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [loadingLedger, setLoadingLedger] = useState(false)
  const [fromDate, setFromDate] = useState(clampFrom(localIso(new Date(new Date().getFullYear(), new Date().getMonth(), 1))))
  const [cutover, setCutover] = useState(cutoverDateSync())
  const [toDate, setToDate] = useState(localIso(new Date()))
  const [showExport, setShowExport] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  // ── New Account modal ──
  const emptyForm = { type: 'expense', code: '', name: '', category: 'Operating Expenses', customCategory: '', cashFlow: 'operating' }
  const [showNew, setShowNew] = useState(false)
  const [naForm, setNaForm] = useState({ ...emptyForm })
  const [naSaving, setNaSaving] = useState(false)
  const [naError, setNaError] = useState('')
  const [naSuccess, setNaSuccess] = useState('')

  const suggestCode = (type: string): string => {
    const prefix = CODE_PREFIX[type] || '9'
    const inType = accounts.filter(a => a.code.startsWith(prefix)).map(a => parseInt(a.code, 10)).filter(n => !isNaN(n))
    if (inType.length === 0) return prefix + '010'
    const next = Math.max(...inType) + 10   // step by 10, leaves gaps for inserts
    return String(next)
  }

  const openNewAccount = () => {
    const type = 'expense'
    setNaForm({ ...emptyForm, type, code: suggestCode(type), category: CATEGORIES_BY_TYPE[type][0], cashFlow: CASHFLOW_DEFAULT[type] })
    setNaError(''); setNaSuccess(''); setShowNew(true)
  }

  const onTypeChange = (type: string) => {
    setNaForm(f => ({
      ...f, type,
      code: suggestCode(type),
      category: (CATEGORIES_BY_TYPE[type] || ['Other'])[0],
      customCategory: '',
      cashFlow: type === 'liability' && f.category === 'Loans' ? 'financing' : CASHFLOW_DEFAULT[type],
    }))
  }

  const onCategoryChange = (category: string) => {
    setNaForm(f => ({
      ...f, category,
      // Loans are financing; fixed assets are investing; everything else keeps its type default
      cashFlow: category === 'Loans' ? 'financing' : category === 'Fixed Assets' ? 'investing' : CASHFLOW_DEFAULT[f.type],
    }))
  }

  const saveNewAccount = async () => {
    setNaError('')
    const code = naForm.code.trim()
    const name = naForm.name.trim()
    const category = naForm.customCategory.trim() || naForm.category
    if (!code) { setNaError('Enter an account code.'); return }
    if (!/^\d{3,6}$/.test(code)) { setNaError('Code must be numbers only, e.g. 6890.'); return }
    if (!code.startsWith(CODE_PREFIX[naForm.type])) {
      setNaError(`A ${naForm.type} account should start with ${CODE_PREFIX[naForm.type]} (e.g. ${CODE_PREFIX[naForm.type]}xxx).`); return
    }
    if (accounts.some(a => a.code === code)) { setNaError(`Code ${code} is already used by "${accounts.find(a => a.code === code)?.name}". Pick another.`); return }
    if (!name) { setNaError('Enter an account name.'); return }
    if (!category) { setNaError('Pick or type a category.'); return }

    setNaSaving(true)
    try {
      const { error } = await supabase.from('accounts').insert({
        code, name,
        type: naForm.type,
        account_type: 'posting',
        category,
        cash_flow_category: naForm.cashFlow,
        is_active: true,
        balance: 0,
      })
      if (error) throw new Error(error.message)
      setNaSuccess(`${code} · ${name} created. It is live everywhere immediately: Journal Entry, reports, dashboard.`)
      await loadAccounts()
      setTimeout(() => { setShowNew(false); setNaSuccess('') }, 1800)
    } catch (e: any) {
      setNaError(e.message || 'Could not create the account.')
    } finally {
      setNaSaving(false)
    }
  }

  useEffect(() => { loadAccounts() }, [])

  const loadAccounts = async () => {
    setLoading(true)
    const { data } = await supabase.from('accounts').select('id, code, name, type, category, balance, is_active').order('code')
    if (data) setAccounts(data)
    setLoading(false)
  }

  const openLedger = async (acct: Account) => {
    setSelectedAccount(acct)
    await fetchLedger(acct, fromDate, toDate)
  }

  const fetchLedger = async (acct: Account, from: string, to: string) => {
    setLoadingLedger(true)
    const cut = await getCutoverDate()
    setCutover(cut)
    const f = clampFrom(from, cut)

    // Filtered server-side through the embedded journals relation. The previous
    // version fetched every line for the account unbounded, so any account past
    // 1,000 lines (1020 M-Pesa has 2,296, 1110 has 2,085, 5010 has 2,036) came
    // back truncated to the oldest 1,000 and the recent entries vanished.
    const { data: lines } = await supabase
      .from('journal_lines')
      .select('id, debit, credit, description, journal_id, journals!inner(ref, posting_date, journal_type, source_ref, status)')
      .eq('account_id', acct.id)
      .gte('journals.posting_date', f)
      .lte('journals.posting_date', to)
      .eq('journals.status', 'posted')
      .order('created_at', { ascending: true })

    if (!lines || lines.length === 0) { setLedger([]); setLoadingLedger(false); return }

    let running = 0
    const entries = lines
      .map((l: any) => {
        const j = l.journals
        running += (l.debit || 0) - (l.credit || 0)
        return {
          id: l.id, posting_date: j.posting_date,
          description: l.description || '—',
          debit: l.debit || 0, credit: l.credit || 0,
          voucher_ref: j.source_ref || j.ref || '—',
          voucher_type: j.journal_type || '',
          running_balance: running,
        }
      })

    setLedger(entries)
    setLoadingLedger(false)
  }

  const applyDateFilter = () => {
    if (selectedAccount) fetchLedger(selectedAccount, fromDate, toDate)
  }

  const totalDebit = ledger.reduce((s, l) => s + l.debit, 0)
  const totalCredit = ledger.reduce((s, l) => s + l.credit, 0)

  // Export to PDF via print
  const exportPDF = () => {
    if (!selectedAccount) return
    const acct = selectedAccount
    const now = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

    const rows = ledger.map(e => `
      <tr>
        <td>${e.posting_date}</td>
        <td>${e.voucher_ref}</td>
        <td>${VOUCHER_TYPE_LABEL[e.voucher_type] || e.voucher_type}</td>
        <td>${e.description}</td>
        <td class="num">${e.debit > 0 ? e.debit.toLocaleString() : '—'}</td>
        <td class="num">${e.credit > 0 ? '(' + e.credit.toLocaleString() + ')' : '—'}</td>
        <td class="num ${e.running_balance >= 0 ? 'pos' : 'neg'}">${e.running_balance.toLocaleString()}</td>
      </tr>`).join('')

    const printRes = printHtmlDocument(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Account Ledger — ${acct.code} ${acct.name}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@500;600&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Instrument Sans', sans-serif; background: #fff; color: #1a1a1a; padding: 40px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #0a0a0a; }
        .logo-area { display: flex; align-items: center; gap: 14px; }
        .logo-mark { width: 52px; height: 52px; background: #0a0a0a; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
        .logo-inner { width: 28px; height: 28px; background: #D48744; border-radius: 6px; }
        .company { font-family: 'Syne', sans-serif; }
        .company-name { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; }
        .company-sub { font-size: 11px; color: #666; margin-top: 2px; font-family: 'DM Mono', monospace; letter-spacing: 0.5px; }
        .doc-info { text-align: right; }
        .doc-title { font-family: 'Syne', sans-serif; font-size: 22px; font-weight: 800; color: #0a0a0a; }
        .doc-meta { font-family: 'DM Mono', monospace; font-size: 10px; color: #888; margin-top: 4px; line-height: 1.6; }
        .acct-banner { background: #0a0a0a; color: #fff; border-radius: 10px; padding: 16px 20px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
        .acct-code { font-family: 'DM Mono', monospace; font-size: 12px; color: #D48744; margin-bottom: 4px; }
        .acct-name { font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 700; }
        .acct-balance { text-align: right; }
        .bal-label { font-size: 10px; color: #888; font-family: 'DM Mono', monospace; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
        .bal-value { font-family: 'DM Mono', monospace; font-size: 22px; font-weight: 500; color: #00E5A0; }
        table { width: 100%; border-collapse: collapse; }
        thead tr { background: #f5f5f5; }
        th { font-family: 'DM Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; padding: 10px 10px; text-align: left; color: #555; border-bottom: 1px solid #e0e0e0; }
        td { padding: 9px 10px; border-bottom: 1px solid #f0f0f0; font-size: 11px; }
        td:first-child { font-family: 'DM Mono', monospace; color: #666; }
        .num { text-align: right; font-family: 'DM Mono', monospace; }
        .pos { color: #1a7a4a; }
        .neg { color: #c0392b; }
        .totals tr { background: #0a0a0a; color: #fff; font-weight: 600; }
        .totals td { font-family: 'DM Mono', monospace; font-size: 12px; padding: 12px 10px; border: none; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; display: flex; justify-content: space-between; font-size: 9px; color: #999; font-family: 'DM Mono', monospace; }
        .period-badge { display: inline-block; background: #f0f0f0; border-radius: 6px; padding: 6px 14px; font-family: 'DM Mono', monospace; font-size: 10px; color: #333; margin-bottom: 16px; }
      </style>
    </head><body>
      <div class="header">
        <div class="logo-area">
          <div class="logo-mark"><div class="logo-inner"></div></div>
          <div class="company">
            <div class="company-name">Malkia Wellness Group Ltd</div>
            <div class="company-sub">MALKIA-OS · FINANCIAL LEDGER EXPORT</div>
          </div>
        </div>
        <div class="doc-info">
          <div class="doc-title">Account Ledger</div>
          <div class="doc-meta">Generated: ${now}<br>Period: ${fromDate} to ${toDate}<br>${ledger.length} transactions</div>
        </div>
      </div>
      <div class="acct-banner">
        <div>
          <div class="acct-code">${acct.code} · ${acct.type.toUpperCase()} · ${acct.category}</div>
          <div class="acct-name">${acct.name}</div>
        </div>
        <div class="acct-balance">
          <div class="bal-label">Closing Balance</div>
          <div class="bal-value">${acct.balance.toLocaleString()} TZS</div>
        </div>
      </div>
      <div class="period-badge">${fromDate} → ${toDate}</div>
      <table>
        <thead><tr><th>Date</th><th>Ref</th><th>Type</th><th>Description</th><th class="num">Debit (TZS)</th><th class="num">Credit (TZS)</th><th class="num">Balance (TZS)</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot class="totals"><tr>
          <td colspan="4">PERIOD TOTALS — ${ledger.length} entries</td>
          <td class="num">${totalDebit.toLocaleString()}</td>
          <td class="num">(${totalCredit.toLocaleString()})</td>
          <td class="num">${acct.balance.toLocaleString()}</td>
        </tr></tfoot>
      </table>
      <div class="footer">
        <span>Malkia Wellness Group Ltd · Dar es Salaam, Tanzania · TIN: — · VRN: —</span>
        <span>MalkiaOS v1.0 · Confidential · For internal use only</span>
      </div>
    </body></html>`)
    if (!printRes.ok && printRes.error) alert(printRes.error)
  }

  // Export to CSV (Excel-compatible)
  const exportCSV = () => {
    if (!selectedAccount) return
    const headers = ['Date', 'Ref', 'Type', 'Description', 'Debit (TZS)', 'Credit (TZS)', 'Running Balance (TZS)']
    const rows = ledger.map(e => [
      e.posting_date, e.voucher_ref,
      VOUCHER_TYPE_LABEL[e.voucher_type] || e.voucher_type,
      `"${e.description.replace(/"/g, '""')}"`,
      e.debit || '', e.credit || '', e.running_balance,
    ])
    const totals = ['TOTALS', '', '', '', totalDebit, totalCredit, selectedAccount.balance]
    const csv = [headers, ...rows, totals].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Ledger_${selectedAccount.code}_${selectedAccount.name.replace(/\s+/g, '_')}_${fromDate}_to_${toDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = accounts.filter(a =>
    (filter === 'all' || a.type === filter) &&
    (a.name.toLowerCase().includes(search.toLowerCase()) || a.code.includes(search))
  ).filter(a => !['heading', 'end_total', 'begin_total'].includes(a.type))

  // ── LEDGER VIEW ─────────────────────────────
  if (selectedAccount) {
    const acct = selectedAccount
    return (
      <div className="page">
        {/* Header */}
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setSelectedAccount(null)}>
              <Ic n="back" /> All Accounts
            </button>
            <div style={{ width: 1, height: 24, background: 'var(--border)' }}></div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>{acct.code}</span>
                <div className="page-title" style={{ margin: 0 }}>{acct.name}</div>
                <span className={`pill ${TYPE_COLOR[acct.type] || 'pill-gray'}`}>{acct.type}</span>
              </div>
              <div className="page-sub">Account Ledger · {ledger.length} entries · <span className="sync-dot"></span> Live</div>
            </div>
          </div>
          <div className="page-actions">
            <div style={{ position: 'relative' }}>
              <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowExport(!showExport)}>
                <Ic n="export" /> Export
              </button>
              {showExport && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: '0 8px 32px rgba(0,0,0,.4)', overflow: 'hidden', zIndex: 50, minWidth: 200 }}>
                  <div style={{ padding: '8px 0' }}>
                    <div style={{ padding: '4px 14px 8px', fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Export Options</div>
                    <button onClick={() => { exportPDF(); setShowExport(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,71,87,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Ic n="pdf" s={16} c="var(--red)" />
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 600 }}>Export as PDF</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)' }}>Malkia branded · Print-ready</div>
                      </div>
                    </button>
                    <button onClick={() => { exportCSV(); setShowExport(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,229,160,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Ic n="excel" s={16} c="var(--green)" />
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 600 }}>Export as CSV / Excel</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)' }}>Open in Excel or Google Sheets</div>
                      </div>
                    </button>
                    <button onClick={() => { exportPDF(); setShowExport(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(61,139,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Ic n="print" s={16} c="var(--blue)" />
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 600 }}>Print Ledger</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)' }}>Opens print dialog</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Account Summary Banner */}
        <div style={{ background: 'linear-gradient(135deg, rgba(10,10,10,1) 0%, rgba(30,30,30,1) 100%)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: '20px 24px', marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 20 }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Account</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700, color: '#fff' }}>{acct.name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>{acct.code} · {acct.category}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Closing Balance</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: acct.balance >= 0 ? 'var(--green)' : 'var(--red)' }}>{tzs(acct.balance)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Period Total In</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 600, color: 'var(--green)' }}>{tzs(totalDebit)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Period Total Out</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 600, color: 'var(--red)' }}>({tzs(totalCredit)})</div>
          </div>
        </div>

        {/* Date Filter */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '6px 12px' }}>
            <Ic n="calendar" s={13} c="var(--text3)" />
            <input type="date" className="form-input" style={{ width: 130, padding: '3px 6px', fontSize: 12, border: 'none', background: 'transparent' }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <span style={{ color: 'var(--text3)', fontSize: 12 }}>to</span>
            <input type="date" className="form-input" style={{ width: 130, padding: '3px 6px', fontSize: 12, border: 'none', background: 'transparent' }} value={toDate} onChange={e => setToDate(e.target.value)} />
            <button className="btn btn-primary btn-sm" onClick={applyDateFilter}>Load</button>
          </div>
          {[
            { label: 'Today', f: localIso(new Date()), t: localIso(new Date()) },
            { label: 'This Week', f: localIso(new Date(Date.now()-6*86400000)), t: localIso(new Date()) },
            { label: 'This Month', f: localIso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), t: localIso(new Date()) },
            { label: 'This Year', f: `${new Date().getFullYear()}-01-01`, t: localIso(new Date()) },
          ].map(p => (
            <button key={p.label} className="btn btn-ghost btn-sm" onClick={() => { setFromDate(p.f); setToDate(p.t); if (selectedAccount) fetchLedger(selectedAccount, p.f, p.t) }}>{p.label}</button>
          ))}
          <div style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{ledger.length} entries</div>
        </div>

        {/* Ledger Table */}
        <div className="card" ref={printRef}>
          <div className="card-header" style={{ marginBottom: 14 }}>
            <div>
              <div className="card-title">{acct.code} — {acct.name}</div>
              <div className="card-sub">{fromDate} to {toDate}</div>
              {fromDate <= cutover && (
                <div className="card-sub" style={{ marginTop: 4, fontSize: 11, color: 'var(--text3)' }}>{cutoverNote(cutover)}</div>
              )}
            </div>
          </div>
          {loadingLedger ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading ledger…</div>
          ) : ledger.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>
              <div style={{ marginBottom: 8 }}><Ic n="ledger" s={32} c="var(--surface3)" /></div>
              No transactions found for this account in the selected period.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>Date</th>
                    <th style={{ width: 110 }}>Voucher Ref</th>
                    <th style={{ width: 120 }}>Type</th>
                    <th>Description</th>
                    <th className="td-right" style={{ width: 140 }}>Debit (TZS)</th>
                    <th className="td-right" style={{ width: 140 }}>Credit (TZS)</th>
                    <th className="td-right" style={{ width: 160 }}>Balance (TZS)</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((e, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.012)' }}>
                      <td className="td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{e.posting_date}</td>
                      <td className="td-mono td-amber" style={{ fontSize: 11 }}>{e.voucher_ref}</td>
                      <td>
                        <span className="pill pill-gray" style={{ fontSize: 9 }}>
                          {VOUCHER_TYPE_LABEL[e.voucher_type] || e.voucher_type || '—'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text2)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description}</td>
                      <td className="td-right td-mono" style={{ color: e.debit > 0 ? 'var(--green)' : 'var(--text3)', fontWeight: e.debit > 0 ? 600 : 400, fontSize: 12 }}>
                        {e.debit > 0 ? e.debit.toLocaleString() : '—'}
                      </td>
                      <td className="td-right td-mono" style={{ color: e.credit > 0 ? 'var(--red)' : 'var(--text3)', fontWeight: e.credit > 0 ? 600 : 400, fontSize: 12 }}>
                        {e.credit > 0 ? `(${e.credit.toLocaleString()})` : '—'}
                      </td>
                      <td className="td-right td-mono" style={{ fontWeight: 600, fontSize: 12, color: e.running_balance >= 0 ? 'var(--text)' : 'var(--red)' }}>
                        {e.running_balance.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td colSpan={4} style={{ padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase' }}>
                      Period Totals — {ledger.length} entries
                    </td>
                    <td className="td-right td-mono" style={{ color: 'var(--green)', fontSize: 13, padding: '12px 14px' }}>{totalDebit.toLocaleString()}</td>
                    <td className="td-right td-mono" style={{ color: 'var(--red)', fontSize: 13, padding: '12px 14px' }}>({totalCredit.toLocaleString()})</td>
                    <td className="td-right td-mono" style={{ color: acct.balance >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 14, fontWeight: 800, padding: '12px 14px' }}>{acct.balance.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── COA LIST VIEW ───────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Chart of Accounts</div>
          <div className="page-sub">Live balances · {accounts.length} accounts · Click any account to open ledger · <span className="sync-dot"></span></div>
        </div>
        <div className="page-actions">
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <Ic n="search" s={13} c="var(--text3)" />
            </span>
            <input className="form-input" style={{ width: 200, padding: '6px 10px 6px 30px', fontSize: 12 }} placeholder="Search accounts…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={loadAccounts}>
            <Ic n="refresh" /> Refresh
          </button>
          <button className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={openNewAccount}>
            <Ic n="plus" /> New Account
          </button>
        </div>
      </div>

      <div className="tabs">
        {['all', 'asset', 'liability', 'equity', 'revenue', 'cogs', 'expense', 'other'].map(t => (
          <button key={t} className={`tab ${filter === t ? 'active' : ''}`} onClick={() => setFilter(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading accounts…</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th><th>Account Name</th><th>Type</th><th>Category</th>
                <th className="td-right">Balance (TZS)</th><th>Status</th><th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => (
                <tr key={i} style={{ cursor: 'pointer' }} onClick={() => openLedger(a)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td className="td-mono td-amber">{a.code}</td>
                  <td>
                    <div className="td-bold">{a.name}</div>
                  </td>
                  <td><span className={`pill ${TYPE_COLOR[a.type] || 'pill-gray'}`}>{a.type.charAt(0).toUpperCase() + a.type.slice(1)}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text3)' }}>{a.category}</td>
                  <td className={`td-right td-mono ${a.balance >= 0 ? 'td-green' : 'td-red'}`} style={{ fontWeight: 600 }}>
                    {a.balance < 0 ? `(${Math.abs(a.balance).toLocaleString()})` : a.balance.toLocaleString()}
                  </td>
                  <td><span className={`pill ${a.is_active ? 'pill-green' : 'pill-gray'}`}>{a.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td style={{ color: 'var(--text3)' }}><Ic n="ledger" s={13} c="var(--text3)" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
        Click any account row to open its full transaction ledger
      </div>

      {/* ── New Account modal ── */}
      {showNew && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => !naSaving && setShowNew(false)}>
          <div className="card" style={{ width: 460, maxWidth: '92vw', padding: 22 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>New Account</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
              Created accounts are live immediately in Journal Entry, all reports, the dashboard and Cash Center.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Type *</label>
                <select className="form-input" value={naForm.type} onChange={e => onTypeChange(e.target.value)}>
                  <option value="asset">Asset (1xxx) — things you own</option>
                  <option value="liability">Liability (2xxx) — things you owe</option>
                  <option value="equity">Equity (3xxx) — owner value</option>
                  <option value="revenue">Revenue (4xxx) — money earned</option>
                  <option value="cogs">COGS (5xxx) — cost of goods</option>
                  <option value="expense">Expense (6xxx) — running costs</option>
                  <option value="other">Other (7xxx) — finance/FX/tax</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Code * (suggested)</label>
                <input className="form-input" value={naForm.code} onChange={e => setNaForm(f => ({ ...f, code: e.target.value }))} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Name *</label>
              <input className="form-input" placeholder="e.g. Fuel — Riders" value={naForm.name}
                onChange={e => setNaForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Category *</label>
                <select className="form-input" value={naForm.category} onChange={e => onCategoryChange(e.target.value)}>
                  {(CATEGORIES_BY_TYPE[naForm.type] || ['Other']).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Or custom category</label>
                <input className="form-input" placeholder="leave blank to use dropdown" value={naForm.customCategory}
                  onChange={e => setNaForm(f => ({ ...f, customCategory: e.target.value }))} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Cash-flow group (auto)</label>
              <select className="form-input" value={naForm.cashFlow} onChange={e => setNaForm(f => ({ ...f, cashFlow: e.target.value }))}>
                <option value="operating">Operating — day-to-day trading</option>
                <option value="investing">Investing — assets/equipment</option>
                <option value="financing">Financing — loans & capital</option>
              </select>
            </div>

            {naError && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{naError}</div>}
            {naSuccess && <div style={{ color: 'var(--green)', fontSize: 13, marginBottom: 12 }}>{naSuccess}</div>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" disabled={naSaving} onClick={() => setShowNew(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={naSaving} onClick={saveNewAccount}>
                {naSaving ? 'Creating…' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
