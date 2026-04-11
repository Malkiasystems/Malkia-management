import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { today } from '../../lib/utils'
import { validatePostingDate } from '../../lib/dateValidation'
import { useAuth } from '../../lib/useAuth'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface DBAccount { id: string; code: string; name: string; category: string }

export default function CashReceipt({ onNav }: Props) {
  const { isSuperAdmin } = useAuth()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [, setPosting] = useState(false)
  const [accounts, setAccounts] = useState<DBAccount[]>([])
  const [form, setForm] = useState({
    date: today(), ref: '', receivedFrom: '', incomeAccount: '',
    cashAccount: '', amount: '', method: 'cash', narration: ''
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadAccounts(); loadNextRef() }, [])

  const loadAccounts = async () => {
    const { data } = await supabase.from('accounts').select('id, code, name, category').eq('is_active', true).order('code')
    if (data) setAccounts(data)
  }

  const loadNextRef = async () => {
    const ref = await nextRef('cash_receipt')
    setForm(f => ({ ...f, ref }))
  }

  const cashAccounts = accounts.filter(a => a.category === 'Cash & Bank')

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  const post = async () => {
    if (!form.receivedFrom.trim()) { showToast('Please enter who paid', 'error'); return }
    if (!form.amount) { showToast('Please enter amount', 'error'); return }
    if (!form.cashAccount) { showToast('Please select deposit account', 'error'); return }
    if (!form.incomeAccount) { showToast('Please select income account', 'error'); return }
    const dateCheck = await validatePostingDate(form.date, isSuperAdmin())
    if (!dateCheck.allowed) { showToast(dateCheck.error || 'Date not allowed', 'error'); return }
    setPosting(true)
    const amount = parseFloat(form.amount)

    try {
      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref, posting_date: form.date,
        description: `Cash Receipt — ${form.receivedFrom} — ${form.ref}`,
        journal_type: 'cash_receipt', source_type: 'cash_receipt',
        source_ref: form.ref, posted_by: 'Joe Gembe', status: 'posted',
      })  
      if (jErr || !journalRaw) throw new Error(jErr?.message || "Journal insert failed")
      const journal = journalRaw

      const { error: jlErr } = await supabase.from('journal_lines').insert([
        { journal_id: journal.id, line_number: 1, account_id: form.cashAccount, description: `Received from ${form.receivedFrom}`, debit: amount, credit: 0 },
        { journal_id: journal.id, line_number: 2, account_id: form.incomeAccount, description: `Income — ${form.narration || form.receivedFrom}`, debit: 0, credit: amount },
      ])
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      await Promise.all([
        supabase.rpc('update_account_balance', { p_account_id: form.cashAccount, p_debit: amount, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: form.incomeAccount, p_debit: 0, p_credit: amount }),
      ])

      await supabase.from('vouchers').insert({
        ref: form.ref, type: 'cash_receipt', posting_date: form.date,
        description: `Cash Receipt — ${form.receivedFrom}`, total_amount: amount,
        status: 'posted', journal_id: journal.id, payment_method: form.method,
        notes: form.narration, posted_by: 'Joe Gembe',
      })

      showToast(`${form.ref} posted · Dr Cash / Cr Income · Journal created`)
      onNav('vouchers')
    } catch (err: any) {
      showToast('' + (err.message || 'Something went wrong'), 'error')
    } finally {
      setPosting(false)
    }
  }

  return (
    <VoucherPage title="Cash Receipt" icon="" subtitle="Record money received in cash or M-Pesa" color="rgba(0,229,160,.12)"
      onPost={post} journalNote="Dr Cash/M-Pesa Account · Cr Revenue/Customer Account">
      <div className="grid g2" style={{ gap: 20 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Receipt Details</div>
          <div className="form-row">
            <FG label="Voucher Ref" req><input className="form-input" value={form.ref} readOnly  /></FG>
            <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
          </div>
          <FG label="Received From" req><input className="form-input" placeholder="e.g. Amina Hassan, Aga Khan Hospital" value={form.receivedFrom} onChange={e => set('receivedFrom', e.target.value)} /></FG>
          <div className="form-row">
            <FG label="Amount (TZS)" req><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }} placeholder="0" value={form.amount} onChange={e => set('amount', e.target.value)} /></FG>
            <FG label="Payment Method" req>
              <select className="form-input" value={form.method} onChange={e => set('method', e.target.value)}>
                <option value="cash"> Cash</option>
                <option value="mpesa"> M-Pesa</option>
                <option value="bank"> Bank Transfer</option>
                <option value="pos"> POS Card</option>
              </select>
            </FG>
          </div>
          <FG label="Narration"><textarea className="form-input" rows={3} placeholder="What is this payment for?" value={form.narration} onChange={e => set('narration', e.target.value)} style={{ resize: 'none' }} /></FG>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Accounting</div>
          <FG label="Deposit To (Debit Account)" req>
            <select className="form-input" value={form.cashAccount} onChange={e => set('cashAccount', e.target.value)}>
              <option value="">— Select account —</option>
              {cashAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </FG>
          <FG label="Income / Credit Account" req>
            <select className="form-input" value={form.incomeAccount} onChange={e => set('incomeAccount', e.target.value)}>
              <option value="">— Select account —</option>
              {accounts.filter(a => ['4010','4011','4020','4110','1050','2070'].includes(a.code)).map(a => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
          </FG>
          {form.amount && form.cashAccount && form.incomeAccount && (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14, marginTop: 8 }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 10 }}>Journal Preview</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--blue)' }}>Dr {accounts.find(a => a.id === form.cashAccount)?.code} — {accounts.find(a => a.id === form.cashAccount)?.name}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{parseInt(form.amount).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0' }}>
                <span style={{ color: 'var(--green)' }}>Cr {accounts.find(a => a.id === form.incomeAccount)?.code} — {accounts.find(a => a.id === form.incomeAccount)?.name}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{parseInt(form.amount).toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
