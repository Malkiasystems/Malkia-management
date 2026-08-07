// src/pages/vouchers/OpeningBalance.tsx
//
// One-time capture of what a business already had when it started using the
// app: money in the bank, cash in the till, who owed them, who they owed.
//
// The accounting is the standard migration entry. Each account is debited or
// credited with its real starting figure, and whatever does not balance is
// plugged to 3040 Opening Balance Equity. That account is the correct home for
// it: the money arrived before the books existed, so no revenue or liability
// explains it, and it belongs to the owner.
//
//   Dr 1010 CRDB Bank        4,500,000
//   Dr 1000 Cash on Hand       200,000
//       Cr 3040 Opening Balance Equity  4,700,000
//
// RUN ONCE. Posting twice would double every starting balance while still
// balancing, so no report would look wrong and nothing would flag it. That is
// why the guard is at the DATABASE, not here: migration 114 adds a partial
// unique index on journals (company_id) WHERE journal_type = 'opening_balance'
// AND status <> 'void'. The check below is only so the user sees a locked
// screen instead of a Postgres error.
//
// Correcting a mistake: void the existing opening balance journal, then this
// screen unlocks and can be posted again. The index deliberately ignores
// voided rows so a typo does not lock the books permanently.
//
// NOT for inventory. Opening stock has its own voucher because it must also
// write item ledger entries, which this does not do. Entering stock value here
// as well would double 1110. The warning below says so.

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { today, tzs } from '../../lib/utils'
import { useAuth } from '../../lib/useAuth'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface Acct { id: string; code: string; name: string; type: string }
interface OBLine { accountId: string; debit: number; credit: number }

const EQUITY_CODE = '3040'

export default function OpeningBalance({ onNav }: Props) {
  const { user } = useAuth()
  const postedByName = user?.full_name || 'System'
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [alreadyPosted, setAlreadyPosted] = useState(false)
  const [accounts, setAccounts] = useState<Acct[]>([])
  const [lines, setLines] = useState<OBLine[]>([{ accountId: '', debit: 0, credit: 0 }])
  const [form, setForm] = useState({ date: today(), notes: 'Opening balances at go-live' })

  const showToast = (m: string, t: 'success' | 'error' = 'success') => {
    setToastType(t); setToast(m); setTimeout(() => setToast(''), 4000)
  }

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    const [{ data: accts }, { count }] = await Promise.all([
      // Header accounts are excluded: nothing should post to a parent.
      supabase.from('accounts')
        .select('id, code, name, type, parent_id')
        .eq('is_active', true)
        .is('parent_id', null)
        .order('code'),
      supabase.from('journals')
        .select('*', { count: 'exact', head: true })
        .eq('journal_type', 'opening_balance')
        .neq('status', 'void'),
    ])
    // Only real posting accounts, and never the balancing account itself:
    // 3040 is computed, not entered, so offering it invites a double plug.
    if (accts) setAccounts(accts.filter(a => a.code !== EQUITY_CODE) as Acct[])
    if ((count || 0) > 0) setAlreadyPosted(true)
    setLoading(false)
  }

  const setLine = (i: number, patch: Partial<OBLine>) =>
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const addLine = () => setLines(ls => [...ls, { accountId: '', debit: 0, credit: 0 }])
  const removeLine = (i: number) => setLines(ls => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls)

  const filled = lines.filter(l => l.accountId && (l.debit > 0 || l.credit > 0))
  const totalDr = filled.reduce((s, l) => s + (l.debit || 0), 0)
  const totalCr = filled.reduce((s, l) => s + (l.credit || 0), 0)
  const diff = Math.round((totalDr - totalCr) * 100) / 100
  // The plug is what 3040 will absorb. Positive diff means debits exceed
  // credits, so equity is credited: the owner's stake in what is on hand.
  const equityCredit = diff > 0 ? diff : 0
  const equityDebit = diff < 0 ? -diff : 0

  const post = async () => {
    if (alreadyPosted) { showToast('Opening balances have already been posted', 'error'); return }
    if (!filled.length) { showToast('Enter at least one account with an amount', 'error'); return }
    if (filled.some(l => l.debit > 0 && l.credit > 0)) {
      showToast('A line can be a debit or a credit, not both', 'error'); return
    }
    const dupe = filled.map(l => l.accountId).filter((v, i, a) => a.indexOf(v) !== i)
    if (dupe.length) { showToast('The same account appears twice. Combine it into one line.', 'error'); return }

    if (posting) return  // double-submit guard: a second click during posting posts twice (Aisha's PCT-10-0001, twice in 0.9s)
    setPosting(true)
    try {
      const { data: eq } = await supabase.from('accounts')
        .select('id').eq('code', EQUITY_CODE).maybeSingle()
      if (!eq) throw new Error(`Account ${EQUITY_CODE} Opening Balance Equity is missing from this company's chart of accounts.`)

      const jLines = filled.map(l => {
        const a = accounts.find(x => x.id === l.accountId)
        return {
          account_id: l.accountId,
          description: a ? `Opening balance: ${a.name}` : 'Opening balance',
          debit: l.debit || 0,
          credit: l.credit || 0,
        }
      })
      if (equityCredit > 0 || equityDebit > 0) {
        jLines.push({
          account_id: eq.id,
          description: 'Opening Balance Equity (balancing entry)',
          debit: equityDebit,
          credit: equityCredit,
        })
      }
      if (jLines.length < 2) throw new Error('An opening balance needs at least two lines to balance.')

      const stamp = new Date().toISOString().slice(11, 16).replace(':', '')
      const ref = `JV-OB-${form.date.replace(/-/g, '')}-${stamp}`

      const { error } = await supabase.rpc('post_journal_transaction', {
        p_ref: ref,
        p_posting_date: form.date,
        p_description: form.notes || 'Opening balances',
        p_journal_type: 'opening_balance',
        p_source_type: 'opening_balance_voucher',
        p_source_ref: ref,
        p_posted_by: postedByName,
        p_branch: null,
        p_lines: jLines,
      })
      if (error) {
        // 23505 is the one-per-company index in migration 114. It fires if a
        // second tab, a retry, or the Data Import path got there first.
        if (error.code === '23505' || /unique|duplicate/i.test(error.message)) {
          setAlreadyPosted(true)
          throw new Error('Opening balances have already been posted for this company. This can only be done once.')
        }
        throw error
      }

      showToast('Opening balances posted', 'success')
      setAlreadyPosted(true)
      setTimeout(() => onNav('__refresh' as Page), 1800)  // stay here, fresh form — a clerk posts several in a row
    } catch (err: any) {
      console.error(err); showToast(err.message || 'Something went wrong', 'error')
    } finally { setPosting(false) }
  }

  return (
    <VoucherPage
      title="Opening Balances"
      icon=""
      subtitle="What the business already had on day one: bank, cash, debtors, creditors. One time only"
      color="rgba(var(--accent-rgb),.12)"
      onPost={post}
      postLabel={posting ? 'Posting…' : 'Post Opening Balances'}
      postPosition="bottom"
      postDisabled={alreadyPosted || loading}
      postDisabledReason={alreadyPosted ? 'Opening balances have already been posted' : 'Loading'}
      journalNote={`Dr/Cr each account · Cr ${EQUITY_CODE} Opening Balance Equity with the difference · Run once at go-live`}
    >
      {alreadyPosted && (
        <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 'var(--r)', padding: 14, marginBottom: 16, fontSize: 12, color: 'var(--red)' }}>
          Opening balances have already been posted for this company, so this voucher is locked. Posting
          again would double every starting figure while still balancing, which no report would flag.
          To correct a mistake, void the existing opening balance journal first, then this screen unlocks.
        </div>
      )}

      <div style={{ background: 'var(--yellow-dim)', border: '1px solid rgba(255,211,42,.3)', borderRadius: 'var(--r)', padding: 14, marginBottom: 16, fontSize: 12, color: 'var(--text2)' }}>
        Enter money in the bank, cash in hand, what customers owed you and what you owed suppliers, as
        at your start date. Do <strong>not</strong> enter stock value here: opening stock has its own
        voucher because it also has to write the item ledger. Entering it in both places doubles your
        inventory. The difference between your debits and credits is posted automatically to Opening
        Balance Equity, which is the correct home for money that arrived before the books existed.
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="As-at Date" req>
            <input type="date" className="form-input" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))} disabled={alreadyPosted} />
          </FG>
          <FG label="Narration">
            <input className="form-input" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} disabled={alreadyPosted} />
          </FG>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text3)', fontSize: 11 }}>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>ACCOUNT</th>
              <th style={{ textAlign: 'right', padding: '8px 6px', width: 150 }}>DEBIT</th>
              <th style={{ textAlign: 'right', padding: '8px 6px', width: 150 }}>CREDIT</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 6px' }}>
                  <select className="form-input" value={l.accountId} disabled={alreadyPosted}
                    onChange={e => setLine(i, { accountId: e.target.value })} style={{ width: '100%' }}>
                    <option value="">Select account…</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: '6px 6px' }}>
                  <input type="number" className="form-input" style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}
                    value={l.debit || ''} placeholder="0" disabled={alreadyPosted}
                    onChange={e => setLine(i, { debit: parseFloat(e.target.value) || 0, credit: 0 })} />
                </td>
                <td style={{ padding: '6px 6px' }}>
                  <input type="number" className="form-input" style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}
                    value={l.credit || ''} placeholder="0" disabled={alreadyPosted}
                    onChange={e => setLine(i, { credit: parseFloat(e.target.value) || 0, debit: 0 })} />
                </td>
                <td style={{ padding: '6px 6px', textAlign: 'center' }}>
                  {!alreadyPosted && lines.length > 1 && (
                    <button className="btn btn-ghost btn-sm" onClick={() => removeLine(i)} title="Remove line">×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!alreadyPosted && (
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={addLine}>+ Add line</button>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
          <span style={{ color: 'var(--text3)' }}>Total debits</span>
          <span style={{ fontFamily: 'var(--mono)' }}>{tzs(totalDr)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
          <span style={{ color: 'var(--text3)' }}>Total credits</span>
          <span style={{ fontFamily: 'var(--mono)' }}>{tzs(totalCr)}</span>
        </div>
        {(equityCredit > 0 || equityDebit > 0) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 4px',
            borderTop: '1px solid var(--border)', marginTop: 6, fontSize: 13, fontWeight: 600 }}>
            <span>{EQUITY_CODE} Opening Balance Equity {equityCredit > 0 ? '(credit)' : '(debit)'}</span>
            <span style={{ fontFamily: 'var(--mono)' }}>{tzs(equityCredit > 0 ? equityCredit : equityDebit)}</span>
          </div>
        )}
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
