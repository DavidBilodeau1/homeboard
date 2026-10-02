import React, { useMemo } from 'react'
import { CalendarCard } from './components/CalendarCard'
import { CalendarFullCard } from './components/CalendarFullCard'
import { MealsCard } from './components/MealsCard'
import { PhotoCard } from './components/PhotoCard'
import { RewardsCard } from './components/RewardsCard'
import { TasksCard } from './components/TasksCard'
import { WeatherCard } from './components/WeatherCard'
import { navigate } from './navigation'
import { useActivePlugins } from './plugins/active'
import type { TileDefinition } from './plugins/types'

const CORE_TILES: TileDefinition[] = [
  { id: 'calendar', titleKey: 'card.calendar', size: { w: 3, h: 9 }, Component: CalendarCard },
  { id: 'calendarFull', titleKey: 'tile.calendarFull', size: { w: 7, h: 9 }, Component: CalendarFullCard },
  { id: 'photo', titleKey: 'nav.photos', size: { w: 6, h: 5 }, Component: PhotoCard },
  { id: 'tasks', titleKey: 'card.tasks', size: { w: 3, h: 5 }, Component: TasksCard },
  { id: 'weather', titleKey: 'tile.weather', size: { w: 3, h: 4 }, Component: WeatherCard },
  {
    id: 'meals',
    titleKey: 'card.meals',
    size: { w: 3, h: 4 },
    Component: ({ editing }) => <MealsCard onOpen={editing ? undefined : () => navigate('meals')} />,
  },
  { id: 'rewards', titleKey: 'card.reward', size: { w: 3, h: 4 }, Component: RewardsCard },
]

/** Every tile the dashboard can show right now, by id. */
export function useTileDefinitions(): Map<string, TileDefinition> {
  const plugins = useActivePlugins()
  return useMemo(
    () => new Map([...CORE_TILES, ...plugins.flatMap((plugin) => plugin.tiles ?? [])].map((tile) => [tile.id, tile])),
    [plugins],
  )
}
