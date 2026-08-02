// ════════════════════════════════════════════════════════════════════════════
// InterimRecon.tsx
//
// Interim Account (1121) reconciliation. Read-only diagnostic report.
//
// Split per house style: reads live in lib/useInterimRecon.ts, types in
// lib/interimReconTypes.ts, UI and local state here. No writes anywhere in
// this feature — it exists to tell you the size of a problem before you decide
// how to fix it, not to fix it.
// ════════════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import { useInterimRecon } from '../lib/useInterimRecon'
import { BUCKET_LABELS, type ReconBucket } from '../lib/interimReconTypes'
import { tzs, formatDate, localIso } from '../lib/utils'
import type { Page } from '../lib/types'

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'csv') return <svg {...p}><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 3v18M2 9h20M2 15h20"/></svg>
  if (n === 'warn') return <svg {...p}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
  if (n === 'check') return <svg {...p}><polyline points="20 6 9 17 4 12"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

const cardStyle: React.CSSProperties = { padding: 14 }
const kLabel: React.CSSProperties = { fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }
const kVal: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700 }
const th: React.CSSProperties = { textAlign: 'left', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 10px', borderBottom: '1px solid var(--border)' }
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 12, borderBottom: '1px solid var(--border)' }
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: 'var(--mono)' }

export default function InterimRecon({ onNav: _onNav }: { onNav?: (p: Page) => void }) {
  const { data, loading, error, reload } = useInterimRecon()
  const [showAll, setShowAll] = useState(false)

  const exportCsv = () => {
    if (!data) return
    const rows = [
      ['Date', 'Journal Ref', 'Source Ref', 'Journal Type', 'Bucket', 'Description', 'Debit', 'Credit'],
      ...data.lines.map(l => [
        l.postingDate, l.journalRef, l.sourceRef, l.journalType,
        BUCKET_LABELS[l.bucket].label, (l.description || '').replace(/"/g, '""'),
        String(l.debit), String(l.credit),
      ]),
    ]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `interim-1121-reconciliation-${localIso(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Reading every line posted to 1121…</div>

  if (error) return (
    <div className="card" style={{ padding: 24, background: 'rgba(255,71,87,.08)', border: '1px solid rgba(255,71,87,.3)', color: 'var(--red)' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Could not build the reconciliation</div>
      <div style={{ fontSize: 12 }}>{error}</div>
      <button className="btn" style={{ marginTop: 12 }} onClick={reload}>Try again</button>
    </div>
  )

  if (!data) return null

  // Four distinct states, and each needs its own verdict. An earlier version only
  // warned when BOTH exposures were open, which meant the most likely real case —
  // GRN credit piling up with no imports in flight — showed a red number and no
  // explanation. Over-clearing (more Purchase Invoice debit than GRN credit) was
  // silent too, and rendered green.
  const bothOpen = data.grnExposure > 0.5 && data.importExposure > 0.5
  const grnOnly = data.grnExposure > 0.5 && !bothOpen
  const overCleared = data.grnExposure < -0.5
  const hasDrift = Math.abs(data.drift) > 0.5
  const clean = !bothOpen && !grnOnly && !overCleared && Math.abs(data.otherNet) < 0.5 && !hasDrift

  // The point of the whole page: how much of the balance is cancelling out.
  const masked = Math.min(Math.abs(data.grnExposure), Math.abs(data.importExposure))

  const buckets: ReconBucket[] = ['grn', 'purchase_invoice', 'import_payment', 'import_receive', 'import_adjustment', 'other']
  const bucketTotals = buckets.map(b => {
    const ls = data.lines.filter(l => l.bucket === b)
    return { bucket: b, count: ls.length, debit: ls.reduce((s, l) => s + l.debit, 0), credit: ls.reduce((s, l) => s + l.credit, 0) }
  }).filter(x => x.count > 0)

  const visibleLines = showAll ? data.lines : data.lines.slice(0, 50)

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Interim Account Reconciliation</div>
          <div className="page-subtitle" style={{ fontSize: 12, color: 'var(--text3)' }}>
            {data.accountCode} — {data.accountName} · split by what actually posted each line
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={reload}><Ic n="refresh" /> Refresh</button>
          <button className="btn" onClick={exportCsv}><Ic n="csv" /> CSV</button>
        </div>
      </div>

      {/* ─── Verdict ─────────────────────────────────────────────────────── */}
      {bothOpen && (
        <div className="card" style={{ marginBottom: 16, padding: 16, background: 'rgba(251,146,60,.08)', border: '1px solid rgba(251,146,60,.35)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ color: 'var(--yellow)', marginTop: 2 }}><Ic n="warn" s={18} /></div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Two opposite exposures are netting against each other</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                The account shows {tzs(data.ledgerBalance)}, but that single figure is hiding {tzs(data.grnExposure)} of
                uninvoiced GRN liability sitting against {tzs(data.importExposure)} of goods paid for and not yet landed.
                About {tzs(masked)} of real exposure cancels out and never appears on the balance sheet.
                GRN credit belongs in Accounts Payable (2010); import debit is a legitimate goods-in-transit asset.
                They should not share an account.
              </div>
            </div>
          </div>
        </div>
      )}
      {grnOnly && (
        <div className="card" style={{ marginBottom: 16, padding: 16, background: 'rgba(255,71,87,.08)', border: '1px solid rgba(255,71,87,.3)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ color: 'var(--red)', marginTop: 2 }}><Ic n="warn" s={18} /></div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{tzs(data.grnExposure)} of supplier liability is not in Accounts Payable</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                Goods were received on {data.bySupplier.reduce((s, x) => s + x.grnCount, 0)} GRNs and only {tzs(data.purchaseInvoiceDebit)} was
                ever matched by a Purchase Invoice. The rest is sitting as a credit in 1121, which is an asset account — so it reads
                as negative inventory on the Balance Sheet instead of as money you owe. AP Aging does not know about it and the
                suppliers below do not show a balance. The Balance Sheet still foots, which is why this never threw an error.
              </div>
            </div>
          </div>
        </div>
      )}
      {overCleared && (
        <div className="card" style={{ marginBottom: 16, padding: 16, background: 'rgba(255,71,87,.08)', border: '1px solid rgba(255,71,87,.3)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ color: 'var(--red)', marginTop: 2 }}><Ic n="warn" s={18} /></div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>More cleared out of 1121 than was ever put in</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                Purchase Invoices have debited {tzs(data.purchaseInvoiceDebit)} against only {tzs(data.grnCredit)} of GRN credit,
                leaving {tzs(Math.abs(data.grnExposure))} over-cleared. Since a Purchase Invoice posts Dr 1121 / Cr AP with no
                check that the GRN exists or that the amount matches, this usually means an invoice was matched to a GRN twice,
                or to a GRN that was never posted. AP is overstated by roughly that amount.
              </div>
            </div>
          </div>
        </div>
      )}
      {clean && (
        <div className="card" style={{ marginBottom: 16, padding: 16, background: 'rgba(0,229,160,.08)', border: '1px solid rgba(0,229,160,.3)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ color: 'var(--green)' }}><Ic n="check" s={18} /></div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              No uninvoiced GRN liability, no unrecognised postings, and the cached balance agrees with the journal lines.
              Any balance here is import goods-in-transit, which clears itself on receipt.
            </div>
          </div>
        </div>
      )}

      {/* ─── Headline numbers ────────────────────────────────────────────── */}
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="card" style={cardStyle}>
          <div style={kLabel}>Balance per journal lines</div>
          <div style={{ ...kVal, color: 'var(--text)' }}>{tzs(data.ledgerBalance)}</div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{data.lineCount} posted lines · debit positive</div>
        </div>
        <div className="card" style={cardStyle}>
          <div style={kLabel}>Balance per accounts cache</div>
          <div style={{ ...kVal, color: hasDrift ? 'var(--red)' : 'var(--text)' }}>{tzs(data.cachedBalance)}</div>
          <div style={{ fontSize: 10, color: hasDrift ? 'var(--red)' : 'var(--text3)', marginTop: 4 }}>
            {hasDrift ? `Drift of ${tzs(data.drift)} · trust the lines` : 'Agrees with the lines'}
          </div>
        </div>
        <div className="card" style={cardStyle}>
          <div style={kLabel}>GRN exposure</div>
          <div style={{ ...kVal, color: Math.abs(data.grnExposure) > 0.5 ? 'var(--red)' : 'var(--green)' }}>{tzs(data.grnExposure)}</div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
            {data.grnExposure < -0.5 ? 'Over-cleared · AP overstated' : 'Unrecorded supplier liability'}
          </div>
        </div>
        <div className="card" style={cardStyle}>
          <div style={kLabel}>Import in transit</div>
          <div style={{ ...kVal, color: 'var(--blue)' }}>{tzs(data.importExposure)}</div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>Paid, not yet landed · self-clears</div>
        </div>
      </div>

      {/* ─── Split by source ─────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 4 }}>What posted to 1121</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>
          Bucketed by journal_type, which each voucher sets at posting time.
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Source</th>
                <th style={th}>What it means</th>
                <th style={{ ...th, textAlign: 'right' }}>Lines</th>
                <th style={{ ...th, textAlign: 'right' }}>Debit</th>
                <th style={{ ...th, textAlign: 'right' }}>Credit</th>
                <th style={{ ...th, textAlign: 'right' }}>Net</th>
              </tr>
            </thead>
            <tbody>
              {bucketTotals.map(b => (
                <tr key={b.bucket}>
                  <td style={{ ...td, fontWeight: 700 }}>{BUCKET_LABELS[b.bucket].label}</td>
                  <td style={{ ...td, color: 'var(--text3)', fontSize: 11 }}>{BUCKET_LABELS[b.bucket].note}</td>
                  <td style={tdNum}>{b.count}</td>
                  <td style={tdNum}>{b.debit ? tzs(b.debit) : '—'}</td>
                  <td style={tdNum}>{b.credit ? tzs(b.credit) : '—'}</td>
                  <td style={{ ...tdNum, fontWeight: 700, color: b.debit - b.credit >= 0 ? 'var(--text)' : 'var(--red)' }}>{tzs(b.debit - b.credit)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...td, fontWeight: 700 }} colSpan={2}>Total</td>
                <td style={{ ...tdNum, fontWeight: 700 }}>{data.lineCount}</td>
                <td style={{ ...tdNum, fontWeight: 700 }}>{tzs(data.totalDebit)}</td>
                <td style={{ ...tdNum, fontWeight: 700 }}>{tzs(data.totalCredit)}</td>
                <td style={{ ...tdNum, fontWeight: 700 }}>{tzs(data.ledgerBalance)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {data.otherNet !== 0 && (
          <div style={{ marginTop: 12, padding: 10, background: 'rgba(255,71,87,.08)', border: '1px solid rgba(255,71,87,.25)', borderRadius: 'var(--r)', fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>
            {tzs(Math.abs(data.otherNet))} reached 1121 through a route this report does not recognise — most likely a manual
            journal entry or a Cash Payment pointed at 1121 by hand. Check those lines below before you correct anything:
            if someone was clearing GRNs by paying straight to 1121, the net effect was accidentally right and the exposure
            above is overstated.
          </div>
        )}
      </div>

      {/* ─── The actionable bit ──────────────────────────────────────────── */}
      {data.bySupplier.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 4 }}>GRN credit by supplier</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.6 }}>
            This is the list you need to move the credit out of 1121 and into AP (2010) against the right supplier.
            Figures are <strong>gross GRN credit</strong>, not net of Purchase Invoices: PurchaseInvoice.tsx stores its
            "Related GRN Ref" as free text and never writes a structured link, so no supplier-level netting is possible.
            Reconcile the {tzs(data.purchaseInvoiceDebit)} of Purchase Invoice debit by hand against this list.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Supplier</th>
                  <th style={{ ...th, textAlign: 'right' }}>GRNs</th>
                  <th style={{ ...th, textAlign: 'right' }}>Credit in 1121</th>
                </tr>
              </thead>
              <tbody>
                {data.bySupplier.map(s => (
                  <tr key={s.supplierId || '__none__'}>
                    <td style={{ ...td, fontWeight: s.supplierName === 'Unattributed' ? 700 : 400, color: s.supplierName === 'Unattributed' ? 'var(--red)' : 'var(--text)' }}>{s.supplierName}</td>
                    <td style={tdNum}>{s.grnCount}</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{tzs(s.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...td, fontWeight: 700 }}>Total GRN credit</td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{data.bySupplier.reduce((s, x) => s + x.grnCount, 0)}</td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{tzs(data.grnCredit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Full ledger ─────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 4 }}>Every posted line in 1121</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>
          Showing {visibleLines.length} of {data.lineCount}. Fetched in full with pagination, so these totals are not
          capped at the Supabase 1,000-row default.
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Source ref</th>
                <th style={th}>Type</th>
                <th style={th}>Description</th>
                <th style={{ ...th, textAlign: 'right' }}>Debit</th>
                <th style={{ ...th, textAlign: 'right' }}>Credit</th>
              </tr>
            </thead>
            <tbody>
              {visibleLines.map(l => (
                <tr key={l.id}>
                  <td style={{ ...td, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{formatDate(l.postingDate)}</td>
                  <td style={{ ...td, fontFamily: 'var(--mono)' }}>{l.sourceRef || '—'}</td>
                  <td style={td}>
                    <span className="pill" style={{ fontSize: 9 }}>{BUCKET_LABELS[l.bucket].label}</span>
                  </td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{l.description || '—'}</td>
                  <td style={tdNum}>{l.debit ? tzs(l.debit) : '—'}</td>
                  <td style={{ ...tdNum, color: l.credit ? 'var(--red)' : undefined }}>{l.credit ? tzs(l.credit) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.lineCount > 50 && (
          <button className="btn" style={{ marginTop: 12 }} onClick={() => setShowAll(v => !v)}>
            {showAll ? 'Show first 50 only' : `Show all ${data.lineCount} lines`}
          </button>
        )}
      </div>
    </>
  )
}
