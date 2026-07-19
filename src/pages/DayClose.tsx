// src/pages/DayClose.tsx — cashier end-of-day close (Z-report).
// Expected figures come from the day's posted cash sales by payment method
// (read-only). Cash is counted by denomination; digital methods prefill to
// expected. Cash variance posts to 6950 Cash Over/Short via the safe RPC, the
// day locks against further cash sales (DB trigger, migration 036).
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'
import type { Page } from '../lib/types'

const NOTES = [10000, 5000, 2000, 1000, 500, 200, 100, 50]
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
const today = () => new Date().toISOString().slice(0, 10)

interface CloseRow { close_date: string; expected: any; counted: any; cash_variance: number; note: string | null; closed_by: string | null }

interface Props { onNav: (p: Page) => void }

export default function DayClose({ onNav }: Props) {
  const [tab, setTab] = useState<'close' | 'history'>('close')
  const [expected, setExpected] = useState<Record<string, number>>({})
  const [denoms, setDenoms] = useState<Record<number, string>>({})
  const [digital, setDigital] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [alreadyClosed, setAlreadyClosed] = useState<CloseRow | null>(null)
  const [history, setHistory] = useState<CloseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(''); const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const notify = (m: string, t: 'success' | 'error' = 'success') => { setToast(m); setToastType(t) }

  const load = async () => {
    setLoading(true)
    const { data: closes } = await supabase.from('daily_closes').select('*').order('close_date', { ascending: false }).limit(30)
    setHistory((closes || []) as CloseRow[])
    const todayClose = (closes || []).find((c: any) => c.close_date === today()) || null
    setAlreadyClosed(todayClose as CloseRow | null)

    const { data: sales } = await supabase.from('vouchers')
      .select('ref, total_amount, payment_method')
      .eq('type', 'cash_sale').eq('posting_date', today()).neq('status', 'void')
    const exp: Record<string, number> = {}
    for (const v of (sales || []) as any[]) {
      const m = v.payment_method || 'Cash'
      exp[m] = (exp[m] || 0) + Number(v.total_amount)
    }
    setExpected(exp)
    const dig: Record<string, string> = {}
    Object.keys(exp).filter(m => m !== 'Cash').forEach(m => { dig[m] = String(Math.round(exp[m])) })
    setDigital(dig)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const countedCash = NOTES.reduce((s, n) => s + n * (parseInt(denoms[n] || '0', 10) || 0), 0)
  const expectedCash = expected['Cash'] || 0
  const cashVariance = countedCash - expectedCash
  const mixedMethods = Object.keys(expected).filter(m => m.includes('+'))

  const submit = async () => {
    if (cashVariance !== 0 && !note.trim()) { notify('Variance is not zero. A short reason note is required.', 'error'); return }
    setSaving(true)
    try {
      let journalId: string | null = null
      if (cashVariance !== 0) {
        const { data: accts } = await supabase.from('accounts').select('id, code').in('code', ['1010', '6950'])
        const cashId = accts?.find(a => a.code === '1010')?.id
        const osId = accts?.find(a => a.code === '6950')?.id
        if (!cashId || !osId) throw new Error('Accounts 1010 / 6950 not found')
        const amt = Math.abs(cashVariance)
        const short = cashVariance < 0
        const { data: jid, error } = await supabase.rpc('post_journal_transaction', {
          p_ref: `JV-DAYCLOSE-${today()}`,
          p_posting_date: today(),
          p_description: `Day close ${today()} — cash ${short ? 'short' : 'over'} TZS ${fmt(amt)}${note ? ' · ' + note : ''}`,
          p_journal_type: 'day_close', p_source_type: 'day_close', p_source_ref: today(),
          p_posted_by: 'Cashier', p_branch: null,
          p_lines: short
            ? [{ account_id: osId, description: 'Cash short at close', debit: amt, credit: 0 },
               { account_id: cashId, description: 'Drawer count below book cash', debit: 0, credit: amt }]
            : [{ account_id: cashId, description: 'Drawer count above book cash', debit: amt, credit: 0 },
               { account_id: osId, description: 'Cash over at close', debit: 0, credit: amt }],
        })
        if (error) throw new Error(error.message)
        journalId = jid as any
      }
      const counted: Record<string, number> = { Cash: countedCash }
      Object.entries(digital).forEach(([m, v]) => { counted[m] = parseFloat(v) || 0 })
      const { error: insErr } = await supabase.from('daily_closes').insert({
        close_date: today(), expected, counted,
        denominations: Object.fromEntries(NOTES.map(n => [n, parseInt(denoms[n] || '0', 10) || 0])),
        cash_variance: cashVariance, note: note || null, closed_by: 'Cashier', journal_id: journalId,
      })
      if (insErr) throw new Error(insErr.message)
      notify(`Day closed. ${cashVariance === 0 ? 'Drawer matches the books exactly.' : `Variance TZS ${fmt(cashVariance)} posted to Cash Over/Short.`}`)
      setTimeout(() => onNav('sales-day-book'), 900)
    } catch (e: any) { notify(e.message, 'error') } finally { setSaving(false) }
  }

  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 16 }
  const mono: React.CSSProperties = { fontFamily: 'var(--mono)' }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 760 }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Day Close</h1>
      <div style={{ color: 'var(--text3)', fontSize: 13, margin: '4px 0 16px' }}>Count the drawer, confirm the day, lock it</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {(['close', 'history'] as const).map(t => (
          <button key={t} className="btn btn-sm" onClick={() => setTab(t)}
            style={{ background: tab === t ? 'var(--accent)' : 'transparent', color: tab === t ? '#111' : 'inherit', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontWeight: 700, cursor: 'pointer' }}>
            {t === 'close' ? `Close ${today()}` : 'History'}
          </button>
        ))}
      </div>

      {loading ? <div style={{ color: 'var(--text3)', padding: 30 }}>Loading…</div> : tab === 'close' ? (
        alreadyClosed ? (
          <>
            <div style={{ ...card, borderColor: 'var(--green)' }}>
              ✓ Today is closed{alreadyClosed.closed_by ? ` by ${alreadyClosed.closed_by}` : ''}.
              Cash variance: <b style={mono}>{fmt(alreadyClosed.cash_variance)}</b>.
              New cash sales dated today are locked out.
            </div>
            <button className="btn btn-primary" style={{ fontWeight: 800 }}
              onClick={() => onNav('sales-day-book')}>
              Open today's Sales Day Book →
            </button>
          </>
        ) : (
          <>
            <div style={card}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Expected today (from posted sales)</div>
              {Object.keys(expected).length === 0 && <div style={{ color: 'var(--text3)', fontSize: 13 }}>No cash sales posted today yet.</div>}
              {Object.entries(expected).map(([m, v]) => (
                <div key={m} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>{m}</span><span style={mono}>{fmt(v)}</span>
                </div>
              ))}
              {mixedMethods.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--gold, #C8A96E)', marginTop: 8 }}>
                  ⚠ Mixed-method sales ({mixedMethods.join(', ')}) — their cash portion is not split in the books, so judge the drawer variance with that in mind.
                </div>
              )}
            </div>

            <div style={card}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Count the cash drawer</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {NOTES.map(n => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ ...mono, fontSize: 12, width: 52, textAlign: 'right', color: 'var(--text3)' }}>{fmt(n)} ×</span>
                    <input className="form-input" inputMode="numeric" placeholder="0" style={{ width: 70, textAlign: 'right' }}
                      value={denoms[n] || ''} onChange={e => setDenoms(d => ({ ...d, [n]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontWeight: 800 }}>
                <span>Counted cash</span><span style={mono}>{fmt(countedCash)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text3)' }}>
                <span>Expected cash</span><span style={mono}>{fmt(expectedCash)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, marginTop: 6, color: cashVariance === 0 ? 'var(--green)' : 'var(--red)' }}>
                <span>{cashVariance === 0 ? 'Exact match' : cashVariance < 0 ? 'SHORT' : 'OVER'}</span>
                <span style={mono}>{fmt(cashVariance)}</span>
              </div>
            </div>

            {Object.keys(digital).length > 0 && (
              <div style={card}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Digital balances (prefilled to expected — adjust only if the wallet disagrees)</div>
                {Object.entries(digital).map(([m, v]) => (
                  <div key={m} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: 13 }}>
                    <span>{m}</span>
                    <input className="form-input" inputMode="decimal" style={{ width: 130, textAlign: 'right' }}
                      value={v} onChange={e => setDigital(d => ({ ...d, [m]: e.target.value }))} />
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 6 }}>Digital differences are recorded for review but not posted — they are usually timing, not loss.</div>
              </div>
            )}

            <div style={card}>
              <input className="form-input" placeholder={cashVariance !== 0 ? 'Why the variance? (required)' : 'Note (optional)'}
                value={note} onChange={e => setNote(e.target.value)} style={{ marginBottom: 12 }} />
              <button className="btn btn-primary" disabled={saving} onClick={submit} style={{ width: '100%', fontWeight: 800 }}>
                {saving ? 'Closing…' : `Close ${today()} and lock the day`}
              </button>
              <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 8 }}>
                After closing: no more cash sales can be posted for today, and any cash variance goes to 6950 Cash Over/Short automatically.
              </div>
            </div>
          </>
        )
      ) : (
        <div style={card}>
          {history.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 13 }}>No closes yet.</div>}
          {history.map(h => (
            <div key={h.close_date} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13, alignItems: 'center' }}>
              <div>
                <b style={mono}>{h.close_date}</b>
                {h.note && <span style={{ color: 'var(--text3)' }}> · {h.note}</span>}
              </div>
              <span style={{ ...mono, fontWeight: 700, color: Number(h.cash_variance) === 0 ? 'var(--green)' : 'var(--red)' }}>
                {Number(h.cash_variance) === 0 ? '✓ exact' : fmt(Number(h.cash_variance))}
              </span>
            </div>
          ))}
        </div>
      )}
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
