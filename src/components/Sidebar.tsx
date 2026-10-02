import React from 'react'
import type { PageDefinition } from '../plugins/types'
import { useStore } from '../store'

interface Props {
  pages: PageDefinition[]
  current: string
  onNavigate: (page: string) => void
}

export function Sidebar({ pages, current, onNavigate }: Props) {
  const { t } = useStore()
  return (
    <nav className="sidebar">
      <div className="side-items">
        {pages.map((page) => (
          <button key={page.id} className={`side-btn${page.id === current ? ' active' : ''}`} onClick={() => onNavigate(page.id)}>
            {page.icon}
            <span>{t(page.titleKey)}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
