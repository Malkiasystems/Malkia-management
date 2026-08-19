import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { useAuth } from './useAuth'
import { supabase } from '../lib/supabase'
import { ToastProvider } from './components/Toast'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import SettingsPage from './pages/SettingsPage'
import StagesPage from './pages/StagesPage'
import BandsPage from './pages/BandsPage'
import ArticlesPage from './pages/ArticlesPage'
import ArticleEditor from './pages/ArticleEditor'
import DownloadsAdmin from './pages/DownloadsAdmin'
import GuidesAdmin from './pages/GuidesAdmin'
import GuideEditor from './pages/GuideEditor'
import FoundationAdmin from './pages/FoundationAdmin'
import LeadsPage from './pages/LeadsPage'

const NAV = [
  ['', 'Dashboard'], ['settings', 'Site copy & settings'], ['stages', 'Stages (spine & nav)'], ['bands', 'Home bands'],
  ['articles', 'Articles'], ['guides', 'Guides (vitabu + PDF)'], ['downloads', 'Uploaded PDFs'], ['foundation', 'Foundation'], ['leads', 'Leads'],
]

export default function AdminApp() {
  const session = useAuth()
  if (session === undefined) return <div className="loading">Loading...</div>
  if (!session) return <ToastProvider><Login /></ToastProvider>
  return (
    <ToastProvider>
      <div className="adm">
        <aside className="adm-side">
          <div className="logo">Malkia <span style={{ fontSize: 12, fontStyle: 'normal', opacity: .6, fontFamily: 'var(--font-body)' }}>site admin</span></div>
          {NAV.map(([p, l]) => <NavLink key={p} to={`/admin/${p}`} end={p === ''}>{l}</NavLink>)}
          <a href="/" target="_blank" rel="noreferrer">View site ↗</a>
          <div className="bottom">{session.user.email}<br /><button style={{ color: '#fff', textDecoration: 'underline', marginTop: 4 }} onClick={() => supabase.auth.signOut()}>Sign out</button></div>
        </aside>
        <main className="adm-main">
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="stages" element={<StagesPage />} />
            <Route path="bands" element={<BandsPage />} />
            <Route path="articles" element={<ArticlesPage />} />
            <Route path="articles/new" element={<ArticleEditor />} />
            <Route path="articles/:id" element={<ArticleEditor />} />
            <Route path="guides" element={<GuidesAdmin />} />
            <Route path="guides/new" element={<GuideEditor />} />
            <Route path="guides/:id" element={<GuideEditor />} />
            <Route path="downloads" element={<DownloadsAdmin />} />
            <Route path="foundation" element={<FoundationAdmin />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  )
}
