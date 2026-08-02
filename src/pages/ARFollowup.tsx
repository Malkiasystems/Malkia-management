// src/pages/ARFollowup.tsx — aged receivables with promise tracking.
// Aging from customer_ledger_entries; promises logged in ar_promises so
// "who did we chase, what did they promise, is it overdue" has a home.
import { useEffect, useState } from 'react'
import { localIso } from '../lib/utils'
import { supabase } from '../lib/supabase'

interface Debtor { customer_id: string; name: string; amount: number; oldest_days: number }
interface Promise_ { id: string; customer_id: string; promised_amount: number; contact_date: string
  due_date: string; note: string | null; status: string; name?: string }
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
const today = () => localIso(new Date())

export default function ARFollowup() {
  const [debtors, setDebtors] = useState<Debtor[]>([])
  const [promises, setPromises] = useState<Promise_[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ customerId: '', amount: '', due: today(), note: '' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const { data: ar, error: e1 } = await supabase.from('customer_ledger_entries')
        .select('customer_id, remaining_amount, posting_date').eq('is_open', true).limit(5000)
      if (e1) throw new Error(e1.message)
      const byCust: Record<string, { amount: number; oldest: number }> = {}
      const now = Date.now()
      for (const r of (ar || []) as any[]) {
        if (!r.customer_id || !(r.remaining_amount > 0)) continue
        const age = r.posting_date ? Math.floor((now - new Date(r.posting_date).getTime()) / 86400000) : 0
        if (!byCust[r.customer_id]) byCust[r.customer_id] = { amount: 0, oldest: 0 }
        byCust[r.customer_id].amount += r.remaining_amount
        byCust[r.customer_id].oldest = Math.max(byCust[r.customer_id].oldest, age)
      }
      const ids = Object.keys(byCust)
      let names: Record<string, string> = {}
      if (ids.length) {
        const { data: custs } = await supabase.from('customers').select('id, name, company').in('id', ids)
        for (const c of (custs || []) as any[]) names[c.id] = c.company || c.name || 'Customer'
      }
      setDebtors(ids.map(id => ({ customer_id: id, name: names[id] || 'Customer',
        amount: byCust[id].amount, oldest_days: byCust[id].oldest }))
        .sort((a, b) => b.amount - a.amount))

      const { data: pr, error: e2 } = await supabase.from('ar_promises')
        .select('*').order('due_date').limit(500)
      if (e2) throw new Error(e2.message)
      setPromises(((pr || []) as Promise_[]).map(p => ({ ...p, name: names[p.customer_id] || 'Customer' })))
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const savePromise = async () => {
    if (!form.customerId || !(+form.amount > 0) || !form.due) return
    setSaving(true)
    const { error } = await supabase.from('ar_promises').insert({
      customer_id: form.customerId, promised_amount: +form.amount,
      due_date: form.due, note: form.note || null, created_by: 'Joe Gembe' })
    setSaving(false)
    if (!error) { setForm({ customerId: '', amount: '', due: today(), note: '' }); load() }
  }
  const setStatus = async (id: string, status: string) => {
    await supabase.from('ar_promises').update({ status }).eq('id', id); load()
  }

  const openPromises = promises.filter(p => p.status === 'open')
  const overdue = openPromises.filter(p => p.due_date < today())
  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 16 }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 980 }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>AR Follow-up</h1>
      <div style={{ color: 'var(--text3)', fontSize: 13, margin: '4px 0 18px' }}>
        Who owes, who promised, and which promises are overdue
      </div>

      {loading ? <div style={{ padding: 40, color: 'var(--text3)' }}>Loading…</div>
      : error ? <div style={{ padding: 20, color: 'var(--red)' }}>{error}</div>
      : (<>
        {overdue.length > 0 && (
          <div style={{ ...card, borderColor: 'var(--red)' }}>
            <b style={{ color: 'var(--red)' }}>⚠ {overdue.length} broken-date promise(s):</b>{' '}
            {overdue.map(p => `${p.name} (${fmt(p.promised_amount)} due ${p.due_date})`).join(' · ')}
            — chase today, or mark broken.
          </div>
        )}

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Open balances ({debtors.length} customers)</div>
          {debtors.map(d => {
            const dp = openPromises.filter(p => p.customer_id === d.customer_id)
            return (
              <div key={d.customer_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10,
                padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13, alignItems: 'center' }}>
                <div>
                  <b>{d.name}</b>
                  <span style={{ color: d.oldest_days > 60 ? 'var(--red)' : 'var(--text3)', marginLeft: 8, fontSize: 12 }}>
                    oldest {d.oldest_days}d
                  </span>
                  {dp.length > 0 && <span style={{ color: 'var(--accent)', marginLeft: 8, fontSize: 12 }}>
                    promised {fmt(dp.reduce((s, p) => s + p.promised_amount, 0))} by {dp[0].due_date}
                  </span>}
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--mono)' }}>{fmt(d.amount)}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setForm(f => ({ ...f, customerId: d.customer_id, amount: String(Math.round(d.amount)) }))}>
                    Log promise
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {form.customerId && (
          <div style={{ ...card, borderColor: 'var(--accent)' }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>
              Log promise · {debtors.find(d => d.customer_id === form.customerId)?.name}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input className="form-input" style={{ width: 140 }} placeholder="Amount" inputMode="decimal"
                value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              <input type="date" className="form-input" style={{ width: 150 }}
                value={form.due} onChange={e => setForm(f => ({ ...f, due: e.target.value }))} />
              <input className="form-input" style={{ flex: 1, minWidth: 180 }} placeholder="Note (how contacted, what said)"
                value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              <button className="btn btn-primary btn-sm" disabled={saving} onClick={savePromise}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setForm({ customerId: '', amount: '', due: today(), note: '' })}>Cancel</button>
            </div>
          </div>
        )}

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Promises</div>
          {promises.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 13 }}>None logged yet.</div>}
          {promises.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0',
              borderBottom: '1px solid var(--border)', fontSize: 13, alignItems: 'center' }}>
              <div>
                <b>{p.name}</b> · {fmt(p.promised_amount)} due {p.due_date}
                {p.note && <span style={{ color: 'var(--text3)' }}> · {p.note}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, textTransform: 'uppercase', fontFamily: 'var(--mono)',
                  color: p.status === 'kept' ? 'var(--green)' : p.status === 'broken' ? 'var(--red)'
                    : p.due_date < today() ? 'var(--red)' : 'var(--text3)' }}>
                  {p.status === 'open' && p.due_date < today() ? 'OVERDUE' : p.status}
                </span>
                {p.status === 'open' && (<>
                  <button className="btn btn-ghost btn-sm" onClick={() => setStatus(p.id, 'kept')}>Kept</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setStatus(p.id, 'broken')}>Broken</button>
                </>)}
              </div>
            </div>
          ))}
        </div>
      </>)}
    </div>
  )
}
