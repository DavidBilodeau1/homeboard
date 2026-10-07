import React, { useEffect, useMemo, useState } from 'react'
import { PageBoundary } from './components/ErrorBoundary'
import { LoginScreen } from './components/LoginScreen'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { makeT, resolveLanguage } from './i18n'
import { navigate, pageFromHash } from './navigation'
import { DEFAULT_PAGE, usePages } from './pages/registry'
import { PluginProviders } from './plugins/active'
import { PLUGIN_MESSAGES } from './plugins/registry'
import { DashboardProvider } from './store'

const SIDEBAR_KEY = 'homeboard-sidebar'

interface Session {
  authEnabled: boolean
  authenticated: boolean
  user: string | null
}

function useHashPage() {
  const [page, setPage] = useState(pageFromHash)
  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return page
}

function useSidebarOpen() {
  const [open, setOpen] = useState(() => localStorage.getItem(SIDEBAR_KEY) !== 'closed')
  const toggle = () => setOpen((wasOpen) => {
    localStorage.setItem(SIDEBAR_KEY, wasOpen ? 'closed' : 'open')
    return !wasOpen
  })
  return [open, toggle] as const
}

function Shell() {
  const pages = usePages()
  const pageId = useHashPage()
  const [sidebarOpen, toggleSidebar] = useSidebarOpen()
  const page = pages.find((p) => p.id === pageId) ?? DEFAULT_PAGE

  return (
    <div className={`app${sidebarOpen ? '' : ' sidebar-closed'}`}>
      <Sidebar pages={pages} current={page.id} onNavigate={navigate} />
      <div className="main">
        <TopBar onToggleSidebar={toggleSidebar} />
        <div className="content">
          <PageBoundary key={page.id}>
            <page.Component />
          </PageBoundary>
        </div>
      </div>
    </div>
  )
}

function useSession() {
  const [session, setSession] = useState<Session>()
  useEffect(() => {
    fetch('/api/session')
      .then((r) => r.json())
      .then(setSession)
      .catch(() => setSession({ authEnabled: true, authenticated: false, user: null }))
  }, [])
  return session
}

export default function App() {
  const session = useSession()
  // the login screen comes before the config, so it speaks the browser's language
  const t = useMemo(() => makeT(resolveLanguage(undefined, navigator.language)), [])

  if (!session) return <div className="app-boot" />
  if (session.authEnabled && !session.authenticated) {
    return <LoginScreen t={t} error={new URLSearchParams(location.search).has('auth_error')} />
  }

  return (
    <DashboardProvider messages={PLUGIN_MESSAGES}>
      <PluginProviders>
        <Shell />
      </PluginProviders>
    </DashboardProvider>
  )
}
