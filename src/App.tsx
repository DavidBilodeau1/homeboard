import React, { useEffect, useMemo, useState } from 'react'
import { DashboardProvider, useStore } from './store'
import { Sidebar, type Page } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { LoginScreen } from './components/LoginScreen'
import { makeT, resolveLanguage } from './i18n'
import { Dashboard } from './pages/Dashboard'
import { CalendarPage } from './pages/CalendarPage'
import { TodoBoardPage } from './pages/TodoBoardPage'
import { RewardsPage } from './pages/RewardsPage'
import { PhotosPage } from './pages/PhotosPage'
import { SettingsPage } from './pages/SettingsPage'
import { SmartHomePage } from './pages/SmartHomePage'
import { FloorPlanPage } from './pages/FloorPlanPage'

const PAGES: Page[] = ['dashboard', 'home', 'floorplan', 'calendar', 'tasks', 'rewards', 'lists', 'meals', 'photos', 'settings']

const pageFromHash = (): Page => {
  const h = location.hash.replace(/^#\/?/, '') as Page
  return PAGES.includes(h) ? h : 'dashboard'
}

function Shell() {
  const [page, setPage] = useState<Page>(pageFromHash)
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('homeboard-sidebar') !== 'closed')
  const { config, t } = useStore()

  useEffect(() => {
    const onHash = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = (p: Page) => { location.hash = `/${p}` }
  const toggleSidebar = () => setSidebarOpen((o) => {
    localStorage.setItem('homeboard-sidebar', o ? 'closed' : 'open')
    return !o
  })

  return (
    <div className={`app${sidebarOpen ? '' : ' sidebar-closed'}`}>
      <Sidebar page={page} onNavigate={navigate} />
      <div className="main">
        <TopBar onToggleSidebar={toggleSidebar} />
        <div className="content">
          {page === 'dashboard' && <Dashboard onNavigate={navigate} />}
          {page === 'home' && <SmartHomePage />}
          {page === 'floorplan' && <FloorPlanPage />}
          {page === 'calendar' && <CalendarPage />}
          {page === 'tasks' && <TodoBoardPage title={t('nav.tasks')} lists={config?.tasks ?? []} />}
          {page === 'rewards' && <RewardsPage />}
          {page === 'lists' && <TodoBoardPage title={t('nav.lists')} lists={config?.lists ?? []} />}
          {page === 'meals' && <TodoBoardPage title={t('nav.meals')} lists={config?.meals ?? []} />}
          {page === 'photos' && <PhotosPage />}
          {page === 'settings' && <SettingsPage />}
        </div>
      </div>
    </div>
  )
}

interface Session { authEnabled: boolean; authenticated: boolean; user: string | null }

export default function App() {
  const [session, setSession] = useState<Session | undefined>(undefined)

  useEffect(() => {
    fetch('/api/session')
      .then((r) => r.json())
      .then(setSession)
      .catch(() => setSession({ authEnabled: true, authenticated: false, user: null }))
  }, [])

  // login screen renders before the store/config load, so build a translator
  // straight from the browser language
  const t = useMemo(() => makeT(resolveLanguage(undefined, navigator.language)), [])

  if (session === undefined) return <div className="app-boot" />
  if (session.authEnabled && !session.authenticated) {
    const error = new URLSearchParams(location.search).has('auth_error')
    return <LoginScreen t={t} error={error} />
  }

  return (
    <DashboardProvider>
      <Shell />
    </DashboardProvider>
  )
}
