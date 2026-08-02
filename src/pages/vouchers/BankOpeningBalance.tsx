// ============================================================================
// BankOpeningBalance.tsx
//
// What each bank, till and mobile money account already held on the cutover
// date. One entry per account, forever.
//
//   Dr 1010 NMB Bank             4,700,000
//   Dr 1020 M-Pesa                 850,000
//     Cr 3040 Opening Balance Equity      5,550,000
//
// The debits land on the ASSET side of the balance sheet, which is the whole
// point: right now every bank reads zero because the 2 August cutover reset
// the ledger and only receivables, payables and inventory were opened.
//
// ── ONE PER ACCOUNT ────────────────────────────────────────────────────────
// Enforced twice, deliberately.
//
//   In the database, by trg_one_opening_balance_per_account (migration 039).
//   That is the real guard: it holds against a second browser tab, a retry
//   after a timeout, or anyone posting the same thing through the journal
//   screen. It is cutover-aware, so an account opened in the OLD books before
//   2 August does not count against you now.
//
//   In this page, by disabling accounts that already have one. That is not
//   security, it is manners: better to grey the row out with the figure
//   showing than to let someone type a number and then refuse it.
//
// 3040 is exempt from the guard because it balances every opening entry, so it
// legitimately recurs. It is never offered as an enterable row here either:
// it is computed from what you enter, so offering it would invite a double
// plug that balances and is wrong.
//
// To correct a mistake: void that account's opening balance journal, and the
// row unlocks by itself.
// ============================================================================

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import Toast from '../../components/Toast'
import MoneyInput from '../../components/MoneyInput'
import { FG } from '../../components/FormHelpers'
import { today, tzs } from '../../lib/utils'
import { useAuth } from '../../lib/useAuth'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

const EQUITY_CODE = '3040'

interface BankAcct {
  id: string
  code: string
  name: string
  alreadyOpened: boolean
  openedAmount: number
}

export default function BankOpeningBalance({ onNav }: Props) {
  const { user } = useAuth()
  const postedByName = user?.full_name || 'System'

  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [accounts, setAccounts] = useState<BankAcct[]>([])
  const [amounts, setAmounts] = useState<Record<string, number>>({})
  const [form, setForm] = useState({ date: today(), notes: 'Bank and cash opening balances' })

  const showToast = (m: string, t: 'success' | 'error' = 'success') => {
    setToastType(t); setToast(m); setTimeout(() => setToast(''), 4500)
  }

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)

    // Cash & Bank posting accounts only. This voucher is deliberately narrow:
    // debtors, creditors and stock have their own opening paths and were
    // already done at cutover.
    const { data: accts } = await supabase
      .from('accounts')
      .select('id, code, name, category, is_active')
      .eq('category', 'Cash & Bank')
      .eq('is_active', true)
      .order('code')

    // Which of them already carry an opening balance since the cutover. Read
    // from the ledger rather than from accounts.balance, because a balance can
    // move for many reasons and only an opening_balance journal means "opened".
    const { data: opened } = await supabase
      .from('journal_lines')
      .select('account_id, debit, credit, journals!inner(journal_type, status, posting_date)')
      .eq('journals.journal_type', 'opening_balance')
      .neq('journals.status', 'void')

    const openedMap: Record<string, number> = {}
    ;(opened || []).forEach((l: any) => {
      openedMap[l.account_id] = (openedMap[l.account_id] || 0) + (l.debit || 0) - (l.credit || 0)
    })

    setAccounts((accts || []).map((a: any) => ({
      id: a.id, code: a.code, name: a.name,
      alreadyOpened: a.id in openedMap,
      openedAmount: openedMap[a.id] || 0,
    })))
    setLoading(false)
  }

  const open = accounts.filter(a => !a.alreadyOpened)
  const done = accounts.filter(a => a.alreadyOpened)

  const filled = open
    .map(a => ({ acct: a, amount: amounts[a.id] || 0 }))
    .filter(x => x.amount !== 0)

  const totalDr = filled.reduce((s, x) => s + x.amount, 0)

  const post = async () => {
    if (!filled.length) { showToast('Enter a balance for at least one account', 'error'); return }
    if (filled.some(x => x.amount < 0)) {
      showToast('A bank cannot open with a negative balance. Use a journal entry for an overdraft.', 'error'); return
    }

    setPosting(true)
    try {
      const { data: eq } = await supabase.from('accounts')
        .select('id').eq('code', EQUITY_CODE).maybeSingle()
      if (!eq) throw new Error(`Account ${EQUITY_CODE} Opening Balance Equity is missing from the chart of accounts.`)

      const jLines = filled.map(x => ({
        account_id: x.acct.id,
        description: `Opening balance: ${x.acct.name}`,
        debit: x.amount,
        credit: 0,
      }))
      jLines.push({
        account_id: eq.id,
        description: 'Opening Balance Equity (balancing entry)',
        debit: 0,
        credit: totalDr,
      })

      const stamp = new Date().toISOString().slice(11, 16).replace(':', '')
      const ref = `JV-OB-BANK-${form.date.replace(/-/g, '')}-${stamp}`

      const { error } = await supabase.rpc('post_journal_transaction', {
        p_ref: ref,
        p_posting_date: form.date,
        p_description: form.notes || 'Bank opening balances',
        p_journal_type: 'opening_balance',
        p_source_type: 'bank_opening_balance_voucher',
        p_source_ref: ref,
        p_posted_by: postedByName,
        p_branch: null,
        p_lines: jLines,
      })

      if (error) {
        // The database guard fires as unique_violation. It means someone got
        // there first, so reload rather than argue: the row will show as done.
        if (error.code === '23505' || /already has an opening balance|unique|duplicate/i.test(error.message)) {
          await load()
          throw new Error(error.message || 'One of those accounts already has an opening balance. The list has been refreshed.')
        }
        throw error
      }

      showToast(`Opening balances posted for ${filled.length} account${filled.length > 1 ? 's' : ''}`, 'success')
      setAmounts({})
      await load()
    } catch (err: any) {
      console.error(err); showToast(err.message || 'Something went wrong', 'error')
    } finally { setPosting(false) }
  }

  return (
    <VoucherPage
      title="Bank Opening Balances"
      icon=""
      subtitle="What each bank, till and mobile money account already held. Once per account"
      color="var(--accent-dim)"
      onPost={post}
      postLabel={posting ? 'Posting…' : 'Post Opening Balances'}
      postDisabled={loading || posting || !filled.length}
      postDisabledReason={loading ? 'Loading' : 'Enter a balance for at least one account'}
      journalNote="Auto-journal: Dr each bank/cash account · Cr 3040 Opening Balance Equity · Assets on the balance sheet"
      onNav={onNav}
    >
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
          <FG label="Date *">
            <input type="date" className="form-input" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </FG>
          <FG label="Narration">
            <input className="form-input" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </FG>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading accounts…</div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header" style={{ marginBottom: 12 }}>
              <div>
                <div className="card-title">Accounts still to open</div>
                <div className="card-sub">
                  Take these figures from the bank statement or a physical count on {form.date}, not from this app
                </div>
              </div>
            </div>

            {open.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                Every cash and bank account already has an opening balance.
              </div>
            ) : open.map(a => (
              <div key={a.id} style={{
                display: 'grid', gridTemplateColumns: '80px 1fr 200px', gap: 12,
                alignItems: 'center', padding: '10px 0',
                borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>{a.code}</span>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{a.name}</span>
                <MoneyInput
                  className="form-input"
                  style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}
                  placeholder="0"
                  value={amounts[a.id] ?? ''}
                  onChange={n => setAmounts(m => ({ ...m, [a.id]: n }))}
                />
              </div>
            ))}

            {filled.length > 0 && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                paddingTop: 14, marginTop: 4, borderTop: '2px solid var(--border2)',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  Total to debit · balanced by 3040 Opening Balance Equity
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
                  {tzs(totalDr)}
                </span>
              </div>
            )}
          </div>

          {done.length > 0 && (
            <div className="card">
              <div className="card-header" style={{ marginBottom: 10 }}>
                <div>
                  <div className="card-title">Already opened</div>
                  <div className="card-sub">
                    Locked. To change one, void its opening balance journal and the row returns above
                  </div>
                </div>
              </div>
              {done.map(a => (
                <div key={a.id} style={{
                  display: 'grid', gridTemplateColumns: '80px 1fr 200px', gap: 12,
                  alignItems: 'center', padding: '8px 0', opacity: .6,
                  borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>{a.code}</span>
                  <span style={{ fontSize: 13 }}>{a.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, textAlign: 'right' }}>{tzs(a.openedAmount)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </VoucherPage>
  )
}
