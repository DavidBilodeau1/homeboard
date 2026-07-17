import React from 'react'
import { useStore } from '../store'

interface BoundaryProps {
  t: (k: string) => string
  children: React.ReactNode
}

interface BoundaryState {
  error: Error | null
}

/** Catches render errors so one broken page can't white-screen a wall panel. */
class Boundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[homeboard] page crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const { t } = this.props
    return (
      <div className="card page-card page-error">
        <h2 className="card-title">{t('error.title')}</h2>
        <p>{t('error.body')}</p>
        <pre>{error.message}</pre>
        <button onClick={() => this.setState({ error: null })}>{t('error.retry')}</button>
      </div>
    )
  }
}

/** Function wrapper so the class boundary gets the store's translator. */
export function PageBoundary({ children }: { children: React.ReactNode }) {
  const { t } = useStore()
  return <Boundary t={t}>{children}</Boundary>
}
