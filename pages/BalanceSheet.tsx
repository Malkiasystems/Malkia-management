import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import { printHtmlDocument } from '../lib/printDocument'

interface BSAccount { code: string; name: string; balance: number; category: string; type: string }

// ════════════════════════════════════════════════════════════════════════════
// SIGNS
//
// accounts.balance is stored as debits minus credits, always. So:
//   assets, expenses    debit-normal   → a healthy balance is POSITIVE
//   liabilities, equity, revenue       → a healthy balance is NEGATIVE
//
// A balance sheet shows liabilities and equity as positive numbers, so those
// three get flipped for display. That is the ONLY transformation allowed.
//
// This page used to call Math.abs() instead, which is not the same thing and
// was wrong in two ways at once:
//   * Owner Capital 3010 holds a 98,000,000 DEBIT — a deficit. Math.abs
//     rendered it as a 98,000,000 credit: a 196m swing on one line.
//   * Inventory 1110 sits at -33,308,995. Math.abs displayed it as POSITIVE
//     33,308,995, so a negative asset read as a healthy one.
//
// Math.abs cannot distinguish "credit-normal" from "wrong sign". Never use it
// on a balance. If a number comes out negative here, that is the ledger telling
// you something, and it should be shown.
// ════════════════════════════════════════════════════════════════════════════
const present = (a: { type: string; balance: number }): number =>
  (a.type === 'liability' || a.type === 'equity' || a.type === 'revenue') ? -a.balance : a.balance

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'pdf') return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
  if (n === 'csv') return <svg {...p}><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 3v18M2 9h20M2 15h20"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

const PDF_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@500;600&display=swap');
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Instrument Sans',sans-serif;color:#1a1a1a;padding:40px;font-size:12px}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:18px;border-bottom:3px solid #0a0a0a}
.logo-area{display:flex;align-items:center;gap:14px}.logo-mark{width:48px;height:48px;background:#0a0a0a;border-radius:12px;display:flex;align-items:center;justify-content:center}.logo-inner{width:26px;height:26px;background:#D48744;border-radius:6px}
.company-name{font-family:'Syne',sans-serif;font-size:17px;font-weight:800}.company-sub{font-family:'DM Mono',monospace;font-size:10px;color:#666;margin-top:3px}
.doc-title{font-family:'Syne',sans-serif;font-size:20px;font-weight:800;text-align:right}.doc-meta{font-family:'DM Mono',monospace;font-size:10px;color:#888;margin-top:4px;text-align:right;line-height:1.6}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:16px}
.col-title{font-family:'Syne',sans-serif;font-size:15px;font-weight:800;margin-bottom:12px;padding:10px 14px;border-radius:8px}
.assets-title{background:#0a0a0a;color:#fff}.liabilities-title{background:#1a1a1a;color:#fff}
.section-label{font-family:'DM Mono',monospace;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#888;padding:8px 0 4px;border-bottom:1px solid #eee;margin-bottom:4px}
.account-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f8f8f8;font-size:11px}
.account-code{font-family:'DM Mono',monospace;color:#D48744;font-size:10px;min-width:40px}
.account-bal{font-family:'DM Mono',monospace;font-weight:500}
.section-total{display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #0a0a0a;margin-top:6px;font-weight:700;font-family:'DM Mono',monospace}
.grand-total{background:#0a0a0a;color:#fff;padding:12px 14px;border-radius:8px;margin-top:16px;display:flex;justify-content:space-between;font-family:'DM Mono',monospace;font-weight:700;font-size:14px}
.balanced-badge{background:#e8f8f0;color:#1a7a4a;padding:8px 14px;border-radius:6px;font-family:'DM Mono',monospace;font-size:10px;margin-top:12px;text-align:center}
.footer{margin-top:24px;padding-top:12px;border-top:1px solid #eee;display:flex;justify-content:space-between;font-size:9px;color:#999;font-family:'DM Mono',monospace}
`

export default function BalanceSheet() {
  const [assets, setAssets] = useState<BSAccount[]>([])
  const [liabilities, setLiabilities] = useState<BSAccount[]>([])
  const [equity, setEquity] = useState<BSAccount[]>([])
  const [revenue, setRevenue] = useState<BSAccount[]>([])
  const [expenses, setExpenses] = useState<BSAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [asAt] = useState(new Date().toISOString().split('T')[0])
  const [showExport, setShowExport] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    // parent_id comes back so header accounts can be excluded. Nothing posts to
    // a header today, but nothing stops it either, and if one ever carries a
    // balance every total on this page silently doubles it.
    const { data } = await supabase.from('accounts')
      .select('id, code, name, type, category, balance, parent_id')
      .eq('is_active', true).order('code')
    if (data) {
      const parentIds = new Set(data.map((a: any) => a.parent_id).filter(Boolean))
      const postable = data.filter((a: any) => !parentIds.has(a.id))
      const live = postable.filter((a: any) => a.balance !== 0) as BSAccount[]
      setAssets(live.filter(a => a.type === 'asset'))
      setLiabilities(live.filter(a => a.type === 'liability'))
      setEquity(live.filter(a => a.type === 'equity'))
      // Revenue and expenses were never loaded before. That is why this page
      // has never balanced and never could: a balance sheet carries the
      // period's profit inside equity, and without these two there is no
      // profit to carry. Account 3030 Current Year Profit/Loss exists in the
      // chart but stays at zero until a year-end close posts to it, so the
      // figure has to be computed here.
      setRevenue(postable.filter((a: any) => a.type === 'revenue') as BSAccount[])
      setExpenses(postable.filter((a: any) => a.type === 'expense' || a.type === 'cogs') as BSAccount[])
    }
    setLoading(false)
  }

  // Every total below comes from present(). Previously the figure PRINTED as
  // Total Assets (Math.abs, in BSSection) and the figure used for the balance
  // CHECK (signed, here) were computed separately and disagreed by ~100m.
  const totalAssets = assets.reduce((s, a) => s + present(a), 0)
  const totalLiabilities = liabilities.reduce((s, a) => s + present(a), 0)
  const equityAccounts = equity.reduce((s, a) => s + present(a), 0)

  const totalRevenue = revenue.reduce((s, a) => s + present(a), 0)
  const totalExpenses = expenses.reduce((s, a) => s + present(a), 0)
  const netIncome = totalRevenue - totalExpenses

  const totalEquity = equityAccounts + netIncome
  const totalLiabEquity = totalLiabilities + totalEquity
  const difference = totalAssets - totalLiabEquity
  const balanced = Math.abs(difference) < 1

  // Net income shown as its own equity line. Synthetic — computed, not posted.
  const NET_INCOME_ROW: BSAccount = {
    code: '3030', name: 'Current Year Profit/Loss (computed)',
    balance: -netIncome, category: 'Equity', type: 'equity',
  }
  const equityWithProfit: BSAccount[] = [...equity, NET_INCOME_ROW]

  const grouped = (accts: BSAccount[]) => accts.reduce((g, a) => {
    if (!g[a.category]) g[a.category] = []
    g[a.category].push(a); return g
  }, {} as Record<string, BSAccount[]>)

  const BSSection = ({ title, accts, color }: { title: string; accts: BSAccount[]; color: string }) => { // eslint-disable-line
    const grp = grouped(accts)
    const total = accts.reduce((s, a) => s + present(a), 0)
    return (
      <div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, marginBottom: 12, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, color }}>
          {title}
        </div>
        {Object.entries(grp).map(([cat, catAccts]) => (
          <div key={cat} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, padding: '6px 0 4px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>{cat}</div>
            {catAccts.map((a, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)' }}>{a.code}</span>
                  <span style={{ fontSize: 12 }}>{a.name}</span>
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: present(a) < 0 ? 'var(--red)' : undefined }}>{present(a).toLocaleString()}</span>
              </div>
            ))}
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid var(--border2)', marginTop: 4 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' }}>Total {title}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 800, color }}>{tzs(total)}</span>
        </div>
      </div>
    )
  }

  const exportPDF = () => {
    const now = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    const renderSection = (accts: BSAccount[], _label: string) => {
      const g = grouped(accts)
      return Object.entries(g).map(([cat, catAccts]) => `
        <div class="section-label">${cat}</div>
        ${catAccts.map(a => `<div class="account-row"><div><span class="account-code">${a.code}</span> ${a.name}</div><div class="account-bal">${present(a).toLocaleString()}</div></div>`).join('')}
      `).join('')
    }
    const printRes = printHtmlDocument(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Balance Sheet</title><style>${PDF_STYLES}</style></head><body>
      <div class="header">
        <div class="logo-area"><div class="logo-mark"><div class="logo-inner"></div></div><div><div class="company-name">Malkia Wellness Group Ltd</div><div class="company-sub">Dar es Salaam, Tanzania · MalkiaOS Financial Reports</div></div></div>
        <div><div class="doc-title">Balance Sheet</div><div class="doc-meta">As at ${asAt}<br>Generated: ${now}</div></div>
      </div>
      <div class="cols">
        <div>
          <div class="col-title assets-title">ASSETS</div>
          ${renderSection(assets, 'Assets')}
          <div class="grand-total"><span>TOTAL ASSETS</span><span>${tzs(totalAssets)}</span></div>
        </div>
        <div>
          <div class="col-title liabilities-title">LIABILITIES & EQUITY</div>
          <div style="margin-bottom:16px">
            <div style="font-weight:700;margin-bottom:8px">Liabilities</div>
            ${renderSection(liabilities, 'Liabilities')}
            <div class="section-total"><span>Total Liabilities</span><span>${tzs(totalLiabilities)}</span></div>
          </div>
          <div>
            <div style="font-weight:700;margin-bottom:8px">Equity</div>
            ${renderSection(equityWithProfit, 'Equity')}
            <div class="section-total"><span>Total Equity</span><span>${tzs(totalEquity)}</span></div>
          </div>
          <div class="grand-total"><span>TOTAL LIAB + EQUITY</span><span>${tzs(totalLiabEquity)}</span></div>
        </div>
      </div>
      <div class="balanced-badge">${balanced ? '✓ BALANCED — Assets = Liabilities + Equity' : `⚠ UNBALANCED — Difference: ${tzs(Math.abs(difference))}`}</div>
      <div class="footer"><span>Malkia Wellness Group Ltd · Dar es Salaam, Tanzania</span><span>MalkiaOS v1.0 · Confidential · Internal use only</span></div>
    </body></html>`)
    if (!printRes.ok && printRes.error) alert(printRes.error)
  }

  const exportCSV = () => {
    const rows = [
      ['ASSETS'], ...assets.map(a => [a.code, a.name, a.category, present(a)]),
      ['Total Assets', '', '', totalAssets], [],
      ['LIABILITIES'], ...liabilities.map(a => [a.code, a.name, a.category, present(a)]),
      ['Total Liabilities', '', '', totalLiabilities], [],
      ['EQUITY'], ...equityWithProfit.map(a => [a.code, a.name, a.category, present(a)]),
      ['Total Equity', '', '', totalEquity], [],
      ['Total Liabilities + Equity', '', '', totalLiabEquity],
      ['Difference (should be 0)', '', '', difference],
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    el.download = `Balance_Sheet_${asAt}.csv`; el.click()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Balance Sheet</div>
          <div className="page-sub">Assets = Liabilities + Equity · As at {asAt} · {balanced ? 'Balanced ✓' : `UNBALANCED by ${tzs(Math.abs(difference))} ⚠`}</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={load}><Ic n="refresh" /> Refresh</button>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowExport(!showExport)}><Ic n="pdf" /> Export</button>
            {showExport && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: '0 8px 32px rgba(0,0,0,.4)', zIndex: 50, minWidth: 190, overflow: 'hidden' }}>
                <button onClick={() => { exportPDF(); setShowExport(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }} onMouseEnter={e => (e.currentTarget.style.background='var(--surface2)')} onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                  <Ic n="pdf" s={13} c="var(--red)" /> Export PDF (Branded)
                </button>
                <button onClick={() => { exportCSV(); setShowExport(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }} onMouseEnter={e => (e.currentTarget.style.background='var(--surface2)')} onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                  <Ic n="csv" s={13} c="var(--green)" /> Export CSV / Excel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <div className="stat-card blue"><div className="stat-label">Total Assets</div><div className="stat-value" style={{ fontSize: 18 }}>{tzs(totalAssets)}</div></div>
        <div className="stat-card red"><div className="stat-label">Total Liabilities</div><div className="stat-value" style={{ fontSize: 18 }}>{tzs(totalLiabilities)}</div></div>
        <div className="stat-card green"><div className="stat-label">Total Equity</div><div className="stat-value" style={{ fontSize: 18 }}>{tzs(totalEquity)}</div></div>
        <div className={`stat-card ${balanced ? 'green' : 'red'}`}><div className="stat-label">Balance Check</div><div className="stat-value" style={{ fontSize: 14 }}>{balanced ? 'BALANCED' : `OUT BY ${tzs(Math.abs(difference))}`}</div></div>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading…</div> : (
        <div className="grid g2" style={{ gap: 20 }}>
          <div className="card"><BSSection title="Assets" accts={assets} color="var(--blue)" /></div>
          <div className="card">
            <BSSection title="Liabilities" accts={liabilities} color="var(--red)" />
            <div style={{ height: 20 }}></div>
            <BSSection title="Equity" accts={equityWithProfit} color="var(--accent)" />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', borderTop: '2px solid var(--accent)', marginTop: 12 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)' }}>Total Liab + Equity</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800, color: balanced ? 'var(--green)' : 'var(--red)' }}>{tzs(totalLiabEquity)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
