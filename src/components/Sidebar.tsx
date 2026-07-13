import React from 'react'
import { useStore } from '../store'
import {
  DashboardIcon, HomeIcon, CalendarIcon, TasksIcon, StarIcon,
  ListsIcon, MealsIcon, PhotosIcon, SettingsIcon,
} from '../icons'

export type Page = 'dashboard' | 'home' | 'calendar' | 'tasks' | 'rewards' | 'lists' | 'meals' | 'photos' | 'settings'

const ITEMS: { id: Page; icon: React.ReactNode }[] = [
  { id: 'dashboard', icon: <DashboardIcon /> },
  { id: 'home', icon: <HomeIcon /> },
  { id: 'calendar', icon: <CalendarIcon /> },
  { id: 'tasks', icon: <TasksIcon /> },
  { id: 'rewards', icon: <StarIcon /> },
  { id: 'lists', icon: <ListsIcon /> },
  { id: 'meals', icon: <MealsIcon /> },
  { id: 'photos', icon: <PhotosIcon /> },
  { id: 'settings', icon: <SettingsIcon /> },
]

export function Sidebar({ page, onNavigate }: { page: Page; onNavigate: (p: Page) => void }) {
  const { t } = useStore()
  return (
    <nav className="sidebar">
      <div className="side-items">
        {ITEMS.map((it) => (
          <button
            key={it.id}
            className={`side-btn${page === it.id ? ' active' : ''}`}
            onClick={() => onNavigate(it.id)}
          >
            {it.icon}
            <span>{t(`nav.${it.id}`)}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
