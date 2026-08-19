import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
export default function Dashboard() {
  const [c, setC] = useState<any>({})
  useEffect(() => {
    Promise.all([
      supabase.from('site_articles').select('id', { count: 'exact', head: true }).eq('is_published', true),
      supabase.from('site_articles').select('id', { count: 'exact', head: true }).eq('is_published', false),
      supabase.from('site_downloads').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('site_bands').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('site_leads').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      supabase.from('site_guides').select('id', { count: 'exact', head: true }).eq('is_published', true),
    ]).then(([a, d, dl, b, l, gd]) => setC({ pub: a.count, draft: d.count, dl: dl.count, bands: b.count, leads: l.count, guides: gd.count }))
  }, [])
  const Box = ({ n, l, to }: { n: any; l: string; to: string }) => <Link to={to} className="card" style={{ display: 'block' }}><div style={{ fontFamily: 'var(--font-display)', fontSize: 40, color: 'var(--maroon)' }}>{n ?? '–'}</div><div className="muted" style={{ fontSize: 13 }}>{l}</div></Link>
  return (
    <>
      <div className="adm-head"><h1>Dashboard</h1><Link className="btn btn-primary btn-sm" to="/admin/articles/new">+ New article</Link></div>
      <div className="grid3">
        <Box n={c.pub} l="Published articles" to="/admin/articles" />
        <Box n={c.draft} l="Draft articles" to="/admin/articles" />
        <Box n={c.guides} l="Published guides" to="/admin/guides" />
        <Box n={c.dl} l="Uploaded PDFs" to="/admin/downloads" />
        <Box n={c.bands} l="Active home bands" to="/admin/bands" />
        <Box n={c.leads} l="New leads" to="/admin/leads" />
      </div>
      <div className="card"><h2>Kanuni za content</h2><ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
        <li>WHY kwanza (Golden Circle), risk kabla ya benefit, CTA yenye nguvu, Swanglish.</li>
        <li>Kila makala iwe na reviewer (midwife) na tarehe ya review kabla ya kupublish.</li>
        <li>Bei, jina na picha ya bidhaa zinabadilishwa MalkiaOS, sio hapa. Hapa unaweka tu "why" line.</li>
      </ul></div>
    </>
  )
}
