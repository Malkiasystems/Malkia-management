// ════════════════════════════════════════════════════════════════════════════
// BankReconciliation.tsx
//
// Paste a bank or mobile money statement, see exactly where it fails to add
// up, then approve the charges it PROVES this account paid and post them as
// balanced journals (debit charges expense, credit the wallet/bank).
//
// Why posting the charge is safe here and not a double-count: CashPayment and
// the expense voucher credit the paying account with the amount TYPED — the
// carrier's charge on top is never captured anywhere. These journals are the
// missing entries, not duplicates.
//
// Split per house style: parsing and reconciliation in lib/bankStatement/
// (pure, testable), mutations in statementPost.ts, reads in
// hooks/useBankStatements.ts, UI and local state here.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import { GuideTip, GuideToggle } from '../components/GuideMode'
import Toast from '../components/Toast'
import MoneyInput from '../components/MoneyInput'
import { useReconAccounts, useStatementImports } from '../hooks/useBankStatements'
import { parseStatement, hashText, extractHeaderBalances } from '../lib/bankStatement/statementParse'
import { reconcile, summarise, isSafeToPost, describeBreak } from '../lib/bankStatement/statementReconcile'
import { saveImport, postCharges, abandonImport } from '../lib/bankStatement/statementPost'
import type { ReconciledRow, StatementSource, StatementSummary } from '../lib/bankStatement/statementTypes'
import { supabase } from '../lib/supabase'
import { getCutoverDate, cutoverDateSync } from '../lib/ledgerCutover'
import { tzs } from '../lib/utils'
import { useAuth, usePermission } from '../lib/useAuth'
import type { Page } from '../lib/types'

const SOURCES: { value: StatementSource; label: string; hint: string }[] = [
  { value: 'mixx_yas', label: 'Mixx by Yas (Tigo Pesa)', hint: 'mixx' },
  { value: 'mpesa', label: 'M-Pesa (CSV)', hint: 'pesa' },
  { value: 'crdb', label: 'CRDB (CSV)', hint: 'crdb' },
  { value: 'nmb', label: 'NMB (CSV)', hint: 'nmb' },
  { value: 'equity', label: 'Equity (CSV)', hint: 'equity' },
]

// ── styles (house tokens) ───────────────────────────────────────────────────
const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16, marginBottom: 16 }
const h2: React.CSSProperties = { fontSize: 13, fontWeight: 700, marginBottom: 12 }
const label: React.CSSProperties = { fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }
const input: React.CSSProperties = { width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '8px 10px', fontSize: 13 }
const kLabel: React.CSSProperties = { fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }
const kVal: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }
const th: React.CSSProperties = { textAlign: 'left', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '7px 8px', fontSize: 12, borderBottom: '1px solid var(--border)', verticalAlign: 'top' }
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }
const note = (border: string, bg: string): React.CSSProperties => ({ border: `1px solid ${border}`, background: bg, borderRadius: 6, padding: '10px 12px', fontSize: 12, marginBottom: 10, lineHeight: 1.5 })
const btn: React.CSSProperties = { background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }

export default function BankReconciliation(_props: { onNav?: (p: Page) => void }) {
  const { user } = useAuth()
  const canPost = usePermission('accounting.edit')
  const { cashAccounts, expenseAccounts } = useReconAccounts()

  const [accountId, setAccountId] = useState('')
  const [source, setSource] = useState<StatementSource>('mixx_yas')
  const [raw, setRaw] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [opening, setOpening] = useState<number | ''>('')
  const [closing, setClosing] = useState<number | ''>('')
  const [cutover, setCutover] = useState<string>(cutoverDateSync())

  const [rows, setRows] = useState<ReconciledRow[] | null>(null)
  const [summary, setSummary] = useState<StatementSummary | null>(null)
  const [selected, setSelected] = useState<Record<number, boolean>>({})
  const [expenseId, setExpenseId] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const { imports, refresh: refreshImports } = useStatementImports(accountId || null)

  useEffect(() => { void getCutoverDate().then(setCutover) }, [])

  // default the expense account to 6512 Bank Charges once accounts load
  useEffect(() => {
    if (!expenseId && expenseAccounts.length) {
      const bc = expenseAccounts.find(a => a.code === '6512')
      if (bc) setExpenseId(bc.id)
    }
  }, [expenseAccounts, expenseId])

  // choosing a source suggests the matching wallet account, without overriding
  // a choice the user already made
  useEffect(() => {
    if (accountId) return
    const hint = SOURCES.find(s => s.value === source)?.hint || ''
    const match = cashAccounts.find(a => a.name.toLowerCase().includes(hint))
    if (match) setAccountId(match.id)
  }, [source, cashAccounts, accountId])

  const onPaste = (text: string) => {
    setRaw(text)
    const { opening: o, closing: c } = extractHeaderBalances(text)
    if (o != null) setOpening(o)
    if (c != null) setClosing(c)
  }

  const onFile = async (f: File | null) => {
    if (!f) return
    setFileName(f.name)
    onPaste(await f.text())
  }

  const runCheck = () => {
    setToast(null)
    const parsed = parseStatement(raw, source)
    if (!parsed.length) {
      setToast({ type: 'error', message: 'No transactions could be read. Check the format, or paste the transaction rows only.' })
      setRows(null); setSummary(null)
      return
    }
    const rec = reconcile(parsed, Number(opening) || 0, cutover)
    const sum = summarise(rec, Number(opening) || 0, Number(closing) || 0)
    setRows(rec)
    setSummary(sum)
    setSelected(Object.fromEntries(rec.filter(r => r.chargeBorne && !r.beforeCutover).map(r => [r.lineNo, true])))
  }

  const selectedRows = useMemo(
    () => (rows ?? []).filter(r => selected[r.lineNo] && r.chargeBorne && !r.beforeCutover),
    [rows, selected]
  )
  const selectedTotal = selectedRows.reduce((s, r) => s + r.printedCharge, 0)
  const blocked = (rows ?? []).filter(r => r.chargeBorne && r.beforeCutover)
  const notOurs = (rows ?? []).filter(r => !r.chargeBorne && r.printedCharge > 0)

  const approveAndPost = async () => {
    if (!rows || !summary || !accountId || !expenseId || busy) return
    setBusy(true)
    try {
      const hash = await hashText(raw)
      const imp = await saveImport({
        accountId, source, fileName, fileHash: hash,
        periodStart: rows[0].entryDate,
        periodEnd: rows[rows.length - 1].entryDate,
        statedOpening: summary.statedOpening,
        statedClosing: summary.statedClosing,
        rows, summary,
        createdBy: user?.email ?? null,
      })

      const { data } = await supabase
        .from('bank_statement_lines').select('id, line_no').eq('import_id', imp.id)
      const idByLine = new Map<number, string>((data ?? []).map((d: { id: string; line_no: number }) => [d.line_no, d.id]))
      const ids = selectedRows.map(r => idByLine.get(r.lineNo)).filter(Boolean) as string[]

      const posted = await postCharges({
        importId: imp.id, lineIds: ids, expenseAccountId: expenseId,
        postedBy: user?.email ?? null,
      })

      const total = posted.reduce((s, p) => s + Number(p.amount), 0)
      setToast({ type: 'success', message: `Posted ${tzs(total)} in charges across ${posted.length} journal(s). Statement saved for the audit trail.` })
      setRows(null); setSummary(null); setRaw(''); setFileName(null)
      void refreshImports()
    } catch (e) {
      setToast({ type: 'error', message: e instanceof Error ? e.message : 'Posting failed.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Bank Reconciliation</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            Check a statement against itself, then post the charges it proves this account paid.
          </div>
        </div>
        <GuideToggle />
      </div>

      {/* ── 1 · load ───────────────────────────────────────────────────────── */}
      <div style={card}>
        <div style={h2}>1 · Load the statement</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
          <div>
            <span style={label}>Statement format</span>
            <select style={input} value={source} onChange={e => setSource(e.target.value as StatementSource)}>
              {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <GuideTip>Ask the bank for CSV where you can. Text copied out of a PDF is the most fragile input, so it is checked the hardest before anything posts.</GuideTip>
          </div>
          <div>
            <span style={label}>Account</span>
            <select style={input} value={accountId} onChange={e => setAccountId(e.target.value)}>
              <option value="">Choose an account</option>
              {cashAccounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select>
            <GuideTip>The ledger account this statement belongs to. Approved charges are credited here, because the payment vouchers only ever recorded the amount typed, never the carrier's fee on top.</GuideTip>
          </div>
          <div>
            <span style={label}>Opening balance</span>
            <MoneyInput value={opening} onChange={v => setOpening(v)} placeholder="0" style={input} />
            <GuideTip>Copied from the statement header automatically when you paste it. The whole check walks forward from this number.</GuideTip>
          </div>
          <div>
            <span style={label}>Closing balance</span>
            <MoneyInput value={closing} onChange={v => setClosing(v)} placeholder="0" style={input} />
            <GuideTip>If the rows cannot walk from opening to closing, the statement is missing an entry, and the gap is shown to the shilling.</GuideTip>
          </div>
        </div>

        <span style={label}>Statement text or CSV</span>
        <input type="file" accept=".csv,.txt,.tsv" style={{ fontSize: 12, marginBottom: 8 }}
          onChange={e => void onFile(e.target.files?.[0] ?? null)} />
        <textarea
          style={{ ...input, height: 140, fontFamily: 'var(--mono)', fontSize: 11, resize: 'vertical' }}
          placeholder="Open the PDF, select the whole statement including the header, copy, and paste here. Or choose a CSV above."
          value={raw}
          onChange={e => onPaste(e.target.value)}
        />
        <GuideTip>Headers and footers are ignored automatically. Every transaction needs its reference visible — that reference is what stops the same charge ever posting twice.</GuideTip>
        <div style={{ marginTop: 10 }}>
          <button style={{ ...btn, opacity: !raw.trim() || !accountId ? 0.5 : 1 }} disabled={!raw.trim() || !accountId} onClick={runCheck}>
            Check the statement
          </button>
        </div>
      </div>

      {/* ── 2 · verdict ────────────────────────────────────────────────────── */}
      {summary && rows && (
        <div style={card}>
          <div style={h2}>2 · What the statement says</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
            <div><div style={kLabel}>Money in</div><div style={kVal}>{tzs(summary.parsedMoneyIn)}</div></div>
            <div><div style={kLabel}>Money out</div><div style={kVal}>{tzs(summary.parsedMoneyOut)}</div></div>
            <div><div style={kLabel}>Should close at</div><div style={kVal}>{tzs(summary.computedClosing)}</div></div>
            <div><div style={kLabel}>Actually closes at</div><div style={kVal}>{tzs(summary.statedClosing)}</div></div>
            <div><div style={kLabel}>Unexplained gap</div><div style={{ ...kVal, color: Math.abs(summary.balanceGap) > 0.01 ? 'var(--red)' : 'var(--green)' }}>{tzs(summary.balanceGap)}</div></div>
            <div><div style={kLabel}>Charges you paid</div><div style={kVal}>{tzs(summary.borneCharges)}</div></div>
          </div>

          {!isSafeToPost(summary) && (
            <div style={note('var(--red)', 'rgba(248,113,113,0.08)')}>
              <b>This statement does not add up.</b> {tzs(Math.abs(summary.balanceGap))} of movement has no
              entry to explain it, across {summary.rowsWithBreaks} row(s). Charges can still be posted, but
              call the provider about the gap first and quote the transaction references either side of the
              flagged row.
            </div>
          )}
          {notOurs.length > 0 && (
            <div style={note('var(--border)', 'var(--surface)')}>
              {tzs(notOurs.reduce((s, r) => s + r.printedCharge, 0))} of service charges are printed on this
              statement but never left the account — they belong to the other side and will not be posted.
            </div>
          )}
          {blocked.length > 0 && (
            <div style={note('var(--border)', 'var(--surface)')}>
              {tzs(blocked.reduce((s, r) => s + r.printedCharge, 0))} of real charges fall before the ledger
              cutover ({cutover}) and cannot be journalled. They belong in an opening balance adjustment.
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Post</th><th style={th}>Date</th><th style={th}>Counterparty</th>
                <th style={{ ...th, textAlign: 'right' }}>Out</th>
                <th style={{ ...th, textAlign: 'right' }}>In</th>
                <th style={{ ...th, textAlign: 'right' }}>Balance</th>
                <th style={{ ...th, textAlign: 'right' }}>Charge</th>
                <th style={th}>Finding</th>
              </tr></thead>
              <tbody>
                {rows.map(r => {
                  const postable = r.chargeBorne && !r.beforeCutover
                  const isBreak = r.flags.includes('balance_break')
                  return (
                    <tr key={r.lineNo} style={isBreak ? { background: 'rgba(248,113,113,0.07)' } : undefined}>
                      <td style={td}>
                        <input type="checkbox" disabled={!postable}
                          checked={!!selected[r.lineNo] && postable}
                          onChange={e => setSelected(s => ({ ...s, [r.lineNo]: e.target.checked }))} />
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>{r.entryDate}</td>
                      <td style={{ ...td, fontFamily: 'var(--mono)' }}>{r.counterparty ?? '—'}</td>
                      <td style={tdNum}>{r.moneyOut ? tzs(r.moneyOut) : ''}</td>
                      <td style={tdNum}>{r.moneyIn ? tzs(r.moneyIn) : ''}</td>
                      <td style={tdNum}>{r.statedBalance != null ? tzs(r.statedBalance) : ''}</td>
                      <td style={tdNum}>{r.printedCharge ? tzs(r.printedCharge) : ''}</td>
                      <td style={{ ...td, fontSize: 11, color: isBreak ? 'var(--red)' : 'var(--text3)', minWidth: 180 }}>
                        {describeBreak(r)}
                        {r.flags.includes('charge_not_borne') && 'Charge printed but not deducted — not yours. '}
                        {r.flags.includes('before_cutover') && 'Before cutover — cannot be journalled. '}
                        {r.flags.includes('malformed_msisdn') && 'Counterparty number has a lost or doubled digit. '}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 3 · approve and post ───────────────────────────────────────────── */}
      {summary && rows && (
        <div style={card}>
          <div style={h2}>3 · Approve and post</div>
          <div style={{ maxWidth: 360, marginBottom: 10 }}>
            <span style={label}>Post charges to</span>
            <select style={input} value={expenseId} onChange={e => setExpenseId(e.target.value)}>
              <option value="">Choose an expense account</option>
              {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select>
            <GuideTip>Bank charges normally go to 6512. One journal is created per date — each charge is its own debit line carrying the transaction reference, and the account above is credited with the day's total.</GuideTip>
          </div>
          <div style={{ fontSize: 12, marginBottom: 10 }}>
            {selectedRows.length} charge(s) selected, totalling <b style={{ fontFamily: 'var(--mono)' }}>{tzs(selectedTotal)}</b>.
          </div>
          {!canPost && (
            <div style={note('var(--border)', 'var(--surface)')}>
              Your role can review this statement but not post. Ask an accounting user to approve.
            </div>
          )}
          <button
            style={{ ...btn, opacity: busy || !canPost || !selectedRows.length || !expenseId ? 0.5 : 1 }}
            disabled={busy || !canPost || !selectedRows.length || !expenseId}
            onClick={() => void approveAndPost()}
          >
            {busy ? 'Posting…' : `Post ${tzs(selectedTotal)} in charges`}
          </button>
        </div>
      )}

      {/* ── history ────────────────────────────────────────────────────────── */}
      {accountId && imports.length > 0 && (
        <div style={card}>
          <div style={h2}>Statements already imported</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Period</th><th style={th}>File</th>
                <th style={{ ...th, textAlign: 'right' }}>Gap</th>
                <th style={{ ...th, textAlign: 'right' }}>Charges</th>
                <th style={th}>Status</th><th style={th}></th>
              </tr></thead>
              <tbody>
                {imports.map(i => (
                  <tr key={i.id}>
                    <td style={{ ...td, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{i.period_start} → {i.period_end}</td>
                    <td style={td}>{i.file_name ?? 'Pasted'}</td>
                    <td style={{ ...tdNum, color: Math.abs(Number(i.balance_gap)) > 0.01 ? 'var(--red)' : undefined }}>{tzs(Number(i.balance_gap))}</td>
                    <td style={tdNum}>{tzs(Number(i.borne_charges))}</td>
                    <td style={td}>{i.status}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {i.status !== 'posted' && (
                        <button style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 11, textDecoration: 'underline', cursor: 'pointer' }}
                          onClick={() => void abandonImport(i.id).then(refreshImports)}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
