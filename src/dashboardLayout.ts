import type { DashboardTile, TileId, DashboardLayout } from './types'

export const GRID_COLS = 12
export const GRID_ROWS = 9
export const GRID_MARGIN = 14

/** All tile types the dashboard can show, with their i18n title key. */
export const TILE_META: { id: TileId; titleKey: string }[] = [
  { id: 'calendar', titleKey: 'card.calendar' },
  { id: 'calendarFull', titleKey: 'tile.calendarFull' },
  { id: 'photo', titleKey: 'nav.photos' },
  { id: 'tasks', titleKey: 'card.tasks' },
  { id: 'weather', titleKey: 'nav.dashboard' },
  { id: 'meals', titleKey: 'card.meals' },
  { id: 'rewards', titleKey: 'card.reward' },
  { id: 'airQuality', titleKey: 'air.title' },
]

/** Recreates the original hard-coded dashboard arrangement. */
export const DEFAULT_TILES: DashboardTile[] = [
  { id: 'calendar', x: 0, y: 0, w: 3, h: 9 },
  { id: 'photo', x: 3, y: 0, w: 6, h: 5 },
  { id: 'tasks', x: 9, y: 0, w: 3, h: 5 },
  { id: 'weather', x: 3, y: 5, w: 3, h: 4 },
  { id: 'meals', x: 6, y: 5, w: 3, h: 4 },
  { id: 'rewards', x: 9, y: 5, w: 3, h: 4 },
]

/** Default w/h used when a tile is (re-)added from the editor's "Add tile" menu. */
export const DEFAULT_SIZE: Record<TileId, { w: number; h: number }> = {
  calendar: { w: 3, h: 9 },
  calendarFull: { w: 7, h: 9 },
  photo: { w: 6, h: 5 },
  tasks: { w: 3, h: 5 },
  weather: { w: 3, h: 4 },
  meals: { w: 3, h: 4 },
  rewards: { w: 3, h: 4 },
  airQuality: { w: 3, h: 4 },
}

export const resolveLayout = (d?: DashboardLayout): Required<DashboardLayout> => ({
  cols: d?.cols ?? GRID_COLS,
  rows: d?.rows ?? GRID_ROWS,
  tiles: d?.tiles?.length ? d.tiles : DEFAULT_TILES,
})
