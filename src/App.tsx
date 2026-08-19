import { Routes, Route, Outlet } from 'react-router-dom'
import { SiteProvider, useSite } from './components/SiteContext'
import Header from './components/Header'
import Footer from './components/Footer'
import Home from './pages/Home'
import StagePage from './pages/StagePage'
import ArticlePage from './pages/ArticlePage'
import DownloadsPage from './pages/DownloadsPage'
import GuidePage from './pages/GuidePage'
import GuidePrint from './pages/GuidePrint'
import FoundationPage from './pages/FoundationPage'
import NotFound from './pages/NotFound'
import { lazy, Suspense } from 'react'
const AdminApp = lazy(() => import('./admin/AdminApp'))

function PublicLayout() {
  const { loaded } = useSite()
  if (!loaded) return <div className="boot" aria-busy="true"><div className="boot-bar" /></div>
  return <><Header /><main><Outlet /></main><Footer /></>
}

export default function App() {
  return (
    <SiteProvider>
      <Routes>
        <Route path="/vitabu/:slug/print" element={<GuidePrint />} />
        <Route path="/admin/*" element={<Suspense fallback={<div className="loading">Loading admin...</div>}><AdminApp /></Suspense>} />
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/vitabu" element={<DownloadsPage />} />
          <Route path="/vitabu/:slug" element={<GuidePage />} />
          <Route path="/foundation" element={<FoundationPage />} />
          <Route path="/makala/:slug" element={<ArticlePage />} />
          <Route path="/:stage" element={<StagePage />} />
          <Route path="/:stage/:slug" element={<ArticlePage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </SiteProvider>
  )
}
