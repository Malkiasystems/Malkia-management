import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/* Circle review moderation.
   Reviews from www.malkia.co.tz/circle land as status='pending' and are
   invisible to the public until someone here approves them. Backend:
   migration 042 (circle_mod_counts / circle_mod_reviews_list /
   circle_mod_review_set). All three RPCs refuse callers who are not active
   MalkiaOS staff, and every decision is stamped with who decided and when.
   Approving or rejecting also recomputes the hospital's stored star
   aggregates, so the public card updates the moment you click. */

type Filter = 'reported' | 'held' | 'live' | 'removed'
interface Row {
  id: string; place_id: string; place_name: string; author_name: string
  rating: number; comment: string; status: string; hold_reason: string | null
  report_count: number; created_at: string
  moderated_at: string | null; moderator: string | null
}
interface Counts { live: number; reported: number; held: number; removed: number }

const fmtAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'sasa hivi'
  if (m < 60) return `dk ${m} zilizopita`
  const h = Math.floor(m / 60)
  if (h < 24) return `saa ${h} zilizopita`
  const d = Math.floor(h / 24)
  if (d < 30) return `siku ${d} zilizopita`
  return new Date(iso).toLocaleDateString('sw-TZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

const Stars = ({ n }: { n: number }) => (
  <span style={{ color: '#B8933E', fontSize: 15, letterSpacing: 1 }} aria-label={`Nyota ${n} kati ya 5`}>
    {'\u2605'.repeat(n)}<span style={{ color: 'var(--border)' }}>{'\u2605'.repeat(5 - n)}</span>
  </span>
)

const TABS: { v: Filter; label: string }[] = [
  { v: 'reported', label: 'Zilizoripotiwa' },
  { v: 'held', label: 'Zimezuiliwa' },
  { v: 'live', label: 'Hewani' },
  { v: 'removed', label: 'Zimeondolewa' },
]

export default function CircleModeration() {
  const [tab, setTab] = useState<Filter>('reported')
  const [rows, setRows] = useState<Row[]>([])
  const [counts, setCounts] = useState<Counts>({ live: 0, reported: 0, held: 0, removed: 0 })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async (t: Filter) => {
    setLoading(true); setErr('')
    const [l, c] = await Promise.all([
      supabase.rpc('circle_mod_reviews_list', { p_filter: t }),
      supabase.rpc('circle_mod_counts'),
    ])
    if (l.error) setErr(l.error.message)
    else setRows((l.data || []) as Row[])
    if (!c.error && c.data?.[0]) setCounts(c.data[0] as Counts)
    setLoading(false)
  }, [])

  useEffect(() => { load(tab) }, [tab, load])

  const act = async (id: string, status: 'approved' | 'rejected' | 'pending') => {
    setBusy(id); setErr('')
    const { error } = await supabase.rpc('circle_mod_review_set', { p_id: id, p_status: status })
    if (error) setErr(error.message)
    else await load(tab)
    setBusy(null)
  }

  const btn = (bg: string, fg: string): React.CSSProperties => ({
    padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 800,
    cursor: 'pointer', border: 'none', background: bg, color: fg,
  })

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Circle: Maoni ya Hospitali</h1>
      <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
        Maoni yanaonekana hewani papo hapo yanapotumwa. Hapa ni doria:
        yaliyoripotiwa na akina mama, yaliyozuiliwa na kichujio (matusi, namba za
        simu), na historia. Kila uamuzi unarekodiwa kwa jina lako.
      </p>

      <div style={{ display: 'flex', gap: 6, margin: '14px 0' }}>
        {TABS.map(t => (
          <button key={t.v} onClick={() => setTab(t.v)}
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: tab === t.v ? 'var(--text1)' : 'var(--surface)',
              color: tab === t.v ? 'var(--surface)' : 'var(--text2)' }}>
            {t.label} <b style={{ opacity: .7 }}>{counts[t.v]}</b>
          </button>
        ))}
        <button onClick={() => load(tab)} title="Pakia upya"
          style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
            border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)' }}>
          &#8635;
        </button>
      </div>

      {err && (
        <div style={{ padding: 12, borderRadius: 8, background: '#FDECEC', border: '1px solid #F5B5B5', color: '#8A1F1F', fontSize: 13, marginBottom: 12 }}>
          {err}
        </div>
      )}

      {loading && <div style={{ color: 'var(--text3)', fontSize: 13, padding: 20 }}>Inapakia...</div>}
      {!loading && !rows.length && (
        <div style={{ padding: 28, borderRadius: 10, border: '1px dashed var(--border)', color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>
          {tab === 'reported' ? 'Hakuna ripoti. Kazi safi.' : tab === 'held' ? 'Hakuna maoni yaliyozuiliwa.' : 'Hakuna kitu hapa bado.'}
        </div>
      )}

      {rows.map(r => (
        <div key={r.id} style={{ padding: 14, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>
              {r.place_name}
              <span style={{ fontWeight: 600, color: 'var(--text3)' }}> &middot; {r.author_name}</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{fmtAgo(r.created_at)}</span>
          </div>
          <div style={{ margin: '6px 0 8px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Stars n={r.rating} />
            {r.report_count > 0 && (
              <span style={{ fontSize: 11, fontWeight: 800, color: '#8A1F1F', background: '#FDECEC', border: '1px solid #F5B5B5', borderRadius: 999, padding: '2px 8px' }}>
                Ripoti {r.report_count}
              </span>
            )}
            {r.hold_reason && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#7A5A1F', background: '#FBF3E2', border: '1px solid #E8D5A8', borderRadius: 999, padding: '2px 8px' }}>
                {r.hold_reason}
              </span>
            )}
          </div>
          {r.comment
            ? <p style={{ margin: '0 0 10px', fontSize: 13.5, lineHeight: 1.5, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>{r.comment}</p>
            : <p style={{ margin: '0 0 10px', fontSize: 12.5, fontStyle: 'italic', color: 'var(--text3)' }}>Nyota tu, hakuna maneno.</p>}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {tab === 'reported' && (
              <button disabled={busy === r.id} onClick={() => act(r.id, 'approved')} style={btn('#1F7A3D', '#fff')} title="Futa ripoti, maoni yabaki hewani">
                {busy === r.id ? '...' : 'Ripoti si ya kweli, baki hewani'}
              </button>
            )}
            {(tab === 'held' || tab === 'removed') && (
              <button disabled={busy === r.id} onClick={() => act(r.id, 'approved')} style={btn('#1F7A3D', '#fff')}>
                {busy === r.id ? '...' : 'Rudisha hewani'}
              </button>
            )}
            {tab !== 'removed' && (
              <button disabled={busy === r.id} onClick={() => act(r.id, 'rejected')} style={btn('#A32626', '#fff')}>
                {busy === r.id ? '...' : 'Ondoa'}
              </button>
            )}
            {r.moderator && (
              <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text3)' }}>
                na {r.moderator}{r.moderated_at ? `, ${fmtAgo(r.moderated_at)}` : ''}
              </span>
            )}
          </div>
        </div>
      ))}

      <p style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 18 }}>
        Kuondoa au kurudisha kunabadilisha nyota za hospitali kwenye tovuti papo hapo.
        Ondoa maoni yenye majina ya watu binafsi, lugha ya matusi, au madai ya kimatibabu hatari.
        Maoni yakiripotiwa na akina mama 3 yanajiondoa hewani yenyewe na kusubiri hapa.
      </p>
    </div>
  )
}
