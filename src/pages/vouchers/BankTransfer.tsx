import { useState, useEffect } from 'react'
import BankTilePicker from '../../components/BankTilePicker'
import MoneyInput from '../../components/MoneyInput'
import { GuideTip } from '../../components/GuideMode'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { today } from '../../lib/utils'
import { validatePostingDate } from '../../lib/dateValidation'
import { useAuth } from '../../lib/useAuth'
import { checkApprovalRequired, submitForApproval } from '../../lib/useApproval'
import type { Page } from '../../lib/types'
import { consumeTransferPrefill } from '../../lib/transferPrefill'

interface Props { onNav: (p: Page) => void }
interface DBAccount { id: string; code: string; name: string }

export default function BankTransfer({ onNav }: Props) {
  const { user, isSuperAdmin } = useAuth()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [accounts, setAccounts] = useState<DBAccount[]>([])
  const [form, setForm] = useState({
    date: today(), ref: '', fromAccount: '', toAccount: '',
    amount: '', fxRate: '', narration: ''
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // Banner shown when we arrived here from a blocked voucher, so the user can
  // see why this form is pre-filled rather than wondering who typed it.
  const [fundingNote, setFundingNote] = useState<string | null>(null)

  useEffect(() => { loadAccounts(); loadNextRef() }, [])

  // A blocked cash voucher can hand off here with the short account, the amount
  // that clears it, and a narration already worked out. Consumed once, so a
  // later manual Bank Transfer opens blank.
  useEffect(() => {
    const pre = consumeTransferPrefill()
    if (!pre) return
    setForm(f => ({
      ...f,
      toAccount: pre.toAccountId || f.toAccount,
      amount:    pre.amount ? String(pre.amount) : f.amount,
      narration: pre.narration || f.narration,
    }))
    setFundingNote(
      'Pre-filled from a blocked payment. Choose the account the money is coming FROM, ' +
      'then check the amount before posting.',
    )
  }, [])

  const loadAccounts = async () => {
    const { data } = await supabase.from('accounts').select('id, code, name, balance, nature, display_color, account_number')
      .eq('type', 'asset').eq('category', 'Cash & Bank').eq('is_active', true).order('code')
    if (data) setAccounts(data)
  }

  const loadNextRef = async () => {
    const ref = await nextRef('bank_transfer')
    setForm(f => ({ ...f, ref }))
  }

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  const post = async () => {
    if (!form.fromAccount || !form.toAccount) { showToast('Please select both accounts', 'error'); return }
    if (form.fromAccount === form.toAccount) { showToast('From and To accounts cannot be the same', 'error'); return }
    if (!form.amount) { showToast('Please enter amount', 'error'); return }
    if (!user) { showToast('You must be signed in', 'error'); return }
    const dateCheck = await validatePostingDate(form.date, isSuperAdmin())
    if (!dateCheck.allowed) { showToast(dateCheck.error || 'Date not allowed', 'error'); return }
    const amount = parseFloat(form.amount)

    // ─── Approval gate ─────────────────────────────────────────────────
    // Large transfers (default > 1M TZS) require super admin approval.
    const check = await checkApprovalRequired('bank_transfer', { value: amount })
    const canBypass = check.superAdminBypass && isSuperAdmin()
    if (check.requiresApproval && check.blockPosting && !canBypass) {
      await submitBankTransferForApproval(amount, check.reason || 'Approval required')
      return
    }

    if (posting) return  // double-submit guard: a second click during posting posts twice (Aisha's PCT-10-0001, twice in 0.9s)
    setPosting(true)

    try {
      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref, posting_date: form.date,
        description: `Bank Transfer — ${accounts.find(a => a.id === form.fromAccount)?.code} to ${accounts.find(a => a.id === form.toAccount)?.code} — ${form.ref}`,
        journal_type: 'bank_transfer', source_type: 'bank_transfer',
        source_ref: form.ref, posted_by: user.full_name, status: 'posted',
      })  
      if (jErr || !journalRaw) throw new Error(jErr?.message || "Journal insert failed")
      const journal = journalRaw

      const { error: jlErr } = await supabase.from('journal_lines').insert([
        { journal_id: journal.id, line_number: 1, account_id: form.toAccount, description: `Transfer in — ${form.narration || form.ref}`, debit: amount, credit: 0 },
        { journal_id: journal.id, line_number: 2, account_id: form.fromAccount, description: `Transfer out — ${form.narration || form.ref}`, debit: 0, credit: amount },
      ])
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      await Promise.all([
        supabase.rpc('update_account_balance', { p_account_id: form.toAccount, p_debit: amount, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: form.fromAccount, p_debit: 0, p_credit: amount }),
      ])

      const { error: ck25 } = await supabase.from('vouchers').insert({
        ref: form.ref, type: 'bank_transfer', posting_date: form.date,
        description: `Bank Transfer — ${form.ref}`, total_amount: amount,
        status: 'posted', journal_id: journal.id, posted_by: user.full_name, notes: form.narration,
      })
      if (ck25) throw new Error('vouchers write failed: ' + ck25.message)

      showToast(`${form.ref} posted · Dr ${accounts.find(a => a.id === form.toAccount)?.code} / Cr ${accounts.find(a => a.id === form.fromAccount)?.code}`)
      // A transfer is a banking action, so land the user back on Banks where
      // they can see the balances they just moved, not on the vouchers hub.
      onNav('banks')
    } catch (err: any) {
      showToast('' + (err.message || 'Something went wrong'), 'error')
    } finally {
      setPosting(false)
    }
  }

  // ─── Approval submission ───────────────────────────────────────────────
  const submitBankTransferForApproval = async (amount: number, reason: string) => {
    if (!user) return
    if (posting) return  // double-submit guard: a second click during posting posts twice (Aisha's PCT-10-0001, twice in 0.9s)
    setPosting(true)
    try {
      const fromAcc = accounts.find(a => a.id === form.fromAccount)
      const toAcc = accounts.find(a => a.id === form.toAccount)

      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
        ref: form.ref, type: 'bank_transfer', posting_date: form.date,
        description: `Bank Transfer — ${fromAcc?.code} to ${toAcc?.code} — ${form.ref}`,
        total_amount: amount, status: 'pending_approval',
        posted_by: user.full_name, notes: form.narration,
      }).select('id').single()
      if (vErr) throw new Error('Pending voucher: ' + vErr.message)

      const snapshot = {
        form: {
          date: form.date, ref: form.ref,
          fromAccount: form.fromAccount, toAccount: form.toAccount,
          amount, narration: form.narration,
        },
      }

      const res = await submitForApproval({
        typeCode: 'bank_transfer',
        referenceType: 'voucher',
        referenceId: voucher!.id,
        referenceNumber: form.ref,
        summary: `Bank transfer ${fromAcc?.code} → ${toAcc?.code}${form.narration ? ' · ' + form.narration : ''}`,
        requestedValue: amount,
        payload: snapshot,
        requestedBy: user.id,
      })
      if (!res.success) {
        await supabase.from('vouchers').delete().eq('id', voucher!.id)
        throw new Error(res.error || 'Submission failed')
      }

      // Don't redirect to /approvals — that's approver-only and would
      // show an Access Denied screen to non-approvers. Confirm the
      // submission and head back to Banks, same as the posted path.
      const approverPhrase = res.assignedToName ? ` · Sent to ${res.assignedToName}` : ''
      showToast(`Submitted for approval · ${reason}${approverPhrase}`, 'success')
      setTimeout(() => onNav('banks'), 1500)
    } catch (e: any) {
      showToast(e.message || 'Submission failed', 'error')
    } finally {
      setPosting(false)
    }
  }

  return (
    <VoucherPage title="Bank Transfer" icon="" subtitle="Move funds between your own bank accounts" color="rgba(61,139,255,.12)"
      onPost={post} postLabel={posting ? 'Posting…' : 'Post Transfer'} postPosition="bottom"
      journalNote="Dr Target Account · Cr Source Account · single TZS amount">
      {fundingNote && (
        <div style={{ marginBottom: 16, padding: '12px 14px', background: '#fff7ed', border: '1px solid #f59e0b', borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>Funding a blocked payment</div>
          <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>{fundingNote}</div>
        </div>
      )}
      <div className="grid g2" style={{ gap: 20 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Transfer Details</div>
          <div className="form-row">
            <FG label="Ref"><input className="form-input" value={form.ref} readOnly style={{ fontFamily: 'var(--mono)', fontWeight: 700, background: 'var(--surface2)', cursor: 'default', color: 'var(--accent)' }} /></FG>
            <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
          </div>
          {/* Direction is the whole point of this voucher, so the two sides
              stop looking like twins (fix-15): FROM is framed red with an
              outgoing arrow, TO is framed green with an incoming one, a swap
              button flips them, and a flow strip spells the movement out
              before posting. */}
          <div style={{ border: '1px solid rgba(255,71,87,.35)', borderLeft: '3px solid var(--red, #ff4757)', borderRadius: 'var(--r)', padding: '12px 14px', marginBottom: 4, background: 'rgba(255,71,87,.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <svg width="18" height="18" fill="none" stroke="var(--red, #ff4757)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>
              <span style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 900, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--red, #ff4757)' }}>From</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>· money leaves</span>
              <span style={{ color: 'var(--red, #ff4757)' }}>*</span>
            </div>
            <BankTilePicker
              accounts={accounts}
              value={form.fromAccount}
              onChange={id => set('fromAccount', id)}
              showBalance
              disabledId={form.toAccount || undefined}
              ariaLabel="Transfer from account"
            />
            <GuideTip>Money leaves the account picked in this red frame and lands in the green one below — the destination tile is greyed out up here so the two sides can never be the same account.</GuideTip>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, margin: '2px 0' }}>
            <svg width="16" height="16" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>
            <button type="button" className="btn btn-ghost btn-sm"
              disabled={!form.fromAccount && !form.toAccount}
              onClick={() => setForm(f => ({ ...f, fromAccount: f.toAccount, toAccount: f.fromAccount }))}
              style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}
              aria-label="Swap from and to accounts">
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M7 16V4M7 4L3 8M7 4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
              Swap
            </button>
          </div>

          <div style={{ border: '1px solid rgba(46,213,115,.35)', borderLeft: '3px solid var(--green, #2ed573)', borderRadius: 'var(--r)', padding: '12px 14px', marginBottom: 14, background: 'rgba(46,213,115,.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <svg width="18" height="18" fill="none" stroke="var(--green, #2ed573)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>
              <span style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 900, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--green, #2ed573)' }}>To</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>· money arrives</span>
              <span style={{ color: 'var(--red, #ff4757)' }}>*</span>
            </div>
            <BankTilePicker
              accounts={accounts}
              value={form.toAccount}
              onChange={id => set('toAccount', id)}
              disabledId={form.fromAccount || undefined}
              ariaLabel="Transfer to account"
            />
          </div>

          {form.fromAccount && form.toAccount && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 12px', marginBottom: 14, borderRadius: 'var(--r)', background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 12, fontFamily: 'var(--mono)' }}>
              <span style={{ color: 'var(--red, #ff4757)', fontWeight: 700 }}>{accounts.find(a => a.id === form.fromAccount)?.name}</span>
              <svg width="14" height="14" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
              <span style={{ color: 'var(--green, #2ed573)', fontWeight: 700 }}>{accounts.find(a => a.id === form.toAccount)?.name}</span>
              {form.amount && <span style={{ color: 'var(--text2)', marginLeft: 6 }}>· TZS {(parseFloat(form.amount) || 0).toLocaleString()}</span>}
            </div>
          )}

          <div className="form-row">
            <FG label="Amount (TZS)" req>
              <MoneyInput
                className="form-input"
                style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700 }}
                placeholder="0"
                value={form.amount}
                onChange={() => { /* raw string is the source of truth here */ }}
                onRawChange={raw => set('amount', raw)}
              />
            </FG>
          </div>
          <FG label="Narration"><textarea className="form-input" rows={2} placeholder="Purpose of transfer" value={form.narration} onChange={e => set('narration', e.target.value)} style={{ resize: 'none' }} /></FG>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Journal Preview</div>
          {form.amount && form.fromAccount && form.toAccount ? (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--blue)' }}>Dr {accounts.find(a => a.id === form.toAccount)?.code} — {accounts.find(a => a.id === form.toAccount)?.name}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{parseInt(form.amount).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0' }}>
                <span style={{ color: 'var(--red)' }}>Cr {accounts.find(a => a.id === form.fromAccount)?.code} — {accounts.find(a => a.id === form.fromAccount)?.name}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{parseInt(form.amount).toLocaleString()}</span>
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text3)', fontSize: 12 }}>Fill in the form to see journal preview</div>
          )}
          {/* Honest scope note (fix-20). The old text told users to post FX
              differences to 7010/7011 — accounts that did not exist until
              migration 071, on a form that cannot express two currencies
              anyway. This voucher moves ONE shilling amount between accounts;
              a true multi-currency transfer is a Journal Entry job. */}
          <div style={{ background: 'var(--yellow-dim)', border: '1px solid rgba(255,211,42,.2)', borderRadius: 'var(--r)', padding: 12, marginTop: 14, fontSize: 11, color: 'var(--yellow)', lineHeight: 1.5 }}>
            This voucher moves a single TZS amount between shilling accounts. For a transfer involving a foreign-currency account, post a Journal Entry instead and book the rate difference to 7010 Foreign Exchange Gain or 7011 Foreign Exchange Loss.
          </div>
        </div>
      </div>
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
