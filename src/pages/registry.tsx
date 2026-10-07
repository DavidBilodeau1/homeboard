import React, { useMemo } from 'react'
import { CalendarIcon, DashboardIcon, HomeIcon, ListsIcon, MealsIcon, PhotosIcon, SettingsIcon, StarIcon, TasksIcon } from '../icons'
import { useActivePlugins } from '../plugins/active'
import type { PageDefinition } from '../plugins/types'
import { CalendarPage } from './CalendarPage'
import { Dashboard } from './Dashboard'
import { PhotosPage } from './PhotosPage'
import { RewardsPage } from './RewardsPage'
import { SettingsPage } from './settings/SettingsPage'
import { SmartHomePage } from './SmartHomePage'
import { TodoBoardPage } from './TodoBoardPage'

const CORE_PAGES: PageDefinition[] = [
  { id: 'dashboard', titleKey: 'nav.dashboard', icon: <DashboardIcon />, Component: Dashboard },
  { id: 'home', titleKey: 'nav.home', icon: <HomeIcon />, Component: SmartHomePage },
  { id: 'calendar', titleKey: 'nav.calendar', icon: <CalendarIcon />, Component: CalendarPage },
  { id: 'tasks', titleKey: 'nav.tasks', icon: <TasksIcon />, Component: () => <TodoBoardPage section="tasks" /> },
  { id: 'rewards', titleKey: 'nav.rewards', icon: <StarIcon />, Component: RewardsPage },
  { id: 'lists', titleKey: 'nav.lists', icon: <ListsIcon />, Component: () => <TodoBoardPage section="lists" /> },
  { id: 'meals', titleKey: 'nav.meals', icon: <MealsIcon />, Component: () => <TodoBoardPage section="meals" /> },
  { id: 'photos', titleKey: 'nav.photos', icon: <PhotosIcon />, Component: PhotosPage },
]

const SETTINGS_PAGE: PageDefinition = { id: 'settings', titleKey: 'nav.settings', icon: <SettingsIcon />, Component: SettingsPage }

export const DEFAULT_PAGE = CORE_PAGES[0]

/** Sidebar pages: core pages with each active plugin's pages slotted in, then Settings. */
export function usePages(): PageDefinition[] {
  const plugins = useActivePlugins()
  return useMemo(() => {
    const pluginPages = plugins.flatMap((plugin) => plugin.pages ?? [])
    const followsCorePage = (page: PageDefinition) => CORE_PAGES.some((core) => core.id === page.after)
    return [
      ...CORE_PAGES.flatMap((core) => [core, ...pluginPages.filter((page) => page.after === core.id)]),
      ...pluginPages.filter((page) => !followsCorePage(page)),
      SETTINGS_PAGE,
    ]
  }, [plugins])
}
