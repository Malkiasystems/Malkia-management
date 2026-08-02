// src/pages/CashFlow.tsx
// Cash Flow Statement — direct method, grouped by cash_flow_category.
// Reads the cash_flow_statement RPC (migration 034). Always reconciles:
// opening cash + net flows = closing cash, computed from the same ledger.
//
// PRE-CUTOVER HONESTY: until the 1-Aug clean books, the operating section is
// distorted — historical expenses were under-recorded and July carries large
// correction journals. The banner below says so and disappears after cutover
// (edit CUTOVER_DATE when the fresh books open).

import { useEffect, useState } from 'react'
import { localIso } from '../lib/utils'
import { supabase } from '../lib/supabase'

const CUTOVER_DATE = '2026-08-01'

interface Row { section: string; code: string; name: string; amount: number }

const fmt = (n: number) => {
  const v = Math.round(n)
  return v < 0 ? `(${Math.abs(v).toLocaleString('en-US')})` : v.toLocaleString('en-US')
}

const firstOfMonth = () => {
  const d = new Date(); return localIso(new Date(d.getFullYear(), d.getMonth(), 1))
}
const today = () => localIso(new Date())

export default function CashFlow() {
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(today())
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async (f = from, t = to) => {
    setLoading(true); setError('')
    const { data, error } = await supabase.rpc('cash_flow_statement', { p_from: f, p_to: t })
    if (error) setError(error.message)
    else setRows(((data || []) as any[]).map(r => ({ ...r, amount: Number(r.amount) })))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const opening = rows.find(r => r.section === '_opening')?.amount ?? 0
  const closing = rows.find(r => r.section === '_closing')?.amount ?? 0
  const sec = (s: string) => rows.filter(r => r.section === s).sort((a, b) => b.amount - a.amount)
  const secTotal = (s: string) => sec(s).reduce((sum, r) => sum + r.amount, 0)
  const netFlow = secTotal('operating') + secTotal('investing') + secTotal('financing')
  const reconciles = Math.abs(opening + netFlow - closing) < 1
  const preCutover = to < CUTOVER_DATE

  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }
  const secHead: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text3)', padding: '14px 0 6px' }
  const line: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }
  const totalLine: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 13, fontWeight: 800 }
  const mono: React.CSSProperties = { fontFamily: 'var(--mono)' }

  const Section = ({ id, label }: { id: string; label: string }) => (
    <>
      <div style={secHead}>{label}</div>
      {sec(id).length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)', padding: '4px 0' }}>No movements</div>}
      {sec(id).map(r => (
        <div key={id + r.code} style={line}>
          <span>{r.code} · {r.name}</span>
          <span style={{ ...mono, color: r.amount < 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(r.amount)}</span>
        </div>
      ))}
      <div style={totalLine}>
        <span>Net cash from {label.toLowerCase()}</span>
        <span style={{ ...mono, color: secTotal(id) < 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(secTotal(id))}</span>
      </div>
    </>
  )

  return (
    <div style={{ padding: '24px 28px', maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Cash Flow Statement</h1>
          <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>Direct method · where cash actually came from and went</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" className="form-input" style={{ width: 150 }} value={from} onChange={e => setFrom(e.target.value)} />
          <span style={{ color: 'var(--text3)' }}>to</span>
          <input type="date" className="form-input" style={{ width: 150 }} value={to} onChange={e => setTo(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={() => load()}>Load</button>
        </div>
      </div>

      {preCutover && (
        <div style={{ ...card, marginTop: 16, borderColor: 'var(--gold, #C8A96E)', fontSize: 13, lineHeight: 1.6 }}>
          ⚠ Period ends before the 1 Aug 2026 clean-books cutover. Historical expenses are
          under-recorded and July carries large correction journals, so the operating section
          overstates or distorts true trading cash flow. Structure is correct; trust the numbers
          fully from August onwards.
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text3)', padding: 40 }}>Loading…</div>
      ) : error ? (
        <div style={{ color: 'var(--red)', padding: 20 }}>{error}</div>
      ) : (
        <div style={{ ...card, marginTop: preCutover ? 0 : 16 }}>
          <div style={{ ...totalLine, borderBottom: '2px solid var(--border)' }}>
            <span>Opening cash · {from}</span>
            <span style={mono}>{fmt(opening)}</span>
          </div>

          <Section id="operating" label="Operating activities" />
          <Section id="investing" label="Investing activities" />
          <Section id="financing" label="Financing activities" />

          <div style={{ ...totalLine, borderTop: '2px solid var(--border)', marginTop: 10 }}>
            <span>Net change in cash</span>
            <span style={{ ...mono, color: netFlow < 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(netFlow)}</span>
          </div>
          <div style={{ ...totalLine, fontSize: 15 }}>
            <span>Closing cash · {to}</span>
            <span style={{ ...mono, color: 'var(--accent)' }}>{fmt(closing)}</span>
          </div>

          <div style={{ fontSize: 12, marginTop: 8, color: reconciles ? 'var(--green)' : 'var(--red)' }}>
            {reconciles
              ? '✓ Reconciles: opening + net change = closing, from the ledger itself.'
              : `✗ Does not reconcile — difference ${fmt(opening + netFlow - closing)}. Tell Claude: a journal is moving cash with no classified counterpart.`}
          </div>
        </div>
      )}
    </div>
  )
}
