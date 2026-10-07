import type { DashboardLayout, DashboardTile } from './types'

export const GRID_COLS = 12
export const GRID_ROWS = 9
export const GRID_MARGIN = 14

export const DEFAULT_TILES: DashboardTile[] = [
  { id: 'calendar', x: 0, y: 0, w: 3, h: 9 },
  { id: 'photo', x: 3, y: 0, w: 6, h: 5 },
  { id: 'tasks', x: 9, y: 0, w: 3, h: 5 },
  { id: 'weather', x: 3, y: 5, w: 3, h: 4 },
  { id: 'meals', x: 6, y: 5, w: 3, h: 4 },
  { id: 'rewards', x: 9, y: 5, w: 3, h: 4 },
]

export const resolveLayout = (layout?: DashboardLayout): Required<DashboardLayout> => ({
  cols: layout?.cols ?? GRID_COLS,
  rows: layout?.rows ?? GRID_ROWS,
  tiles: layout?.tiles?.length ? layout.tiles : DEFAULT_TILES,
})
