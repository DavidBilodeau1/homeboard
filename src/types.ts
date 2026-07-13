export interface CalendarCfg {
  entity: string
  name?: string
  color: string
}

export interface ListCfg {
  name: string
  entity: string | null
  color?: string
}

export type ThemeMode = 'auto' | 'light' | 'dark' | 'sun'

export type TileId = 'calendar' | 'calendarFull' | 'photo' | 'tasks' | 'weather' | 'meals' | 'rewards'

export interface DashboardTile {
  id: TileId
  x: number
  y: number
  w: number
  h: number
}

export interface DashboardLayout {
  cols?: number
  rows?: number
  tiles: DashboardTile[]
}

export interface NamedEntity {
  name: string
  entity: string
  icon?: string
  /** cameras: higher-resolution entity used for the fullscreen overlay */
  zoomEntity?: string
}

export interface SmartHomeCfg {
  climate?: string
  cameras?: NamedEntity[]
  sensors?: NamedEntity[]
  lights?: NamedEntity[]
  locks?: NamedEntity[]
  alarm?: string
}

export interface EntityState {
  state: string
  attributes: Record<string, unknown>
}

export interface PersonState {
  entity: string
  name: string
  state: string // 'home' | 'not_home' | zone name
}

export interface AppConfig {
  locale?: string
  language?: string
  theme?: ThemeMode
  weatherEntity: string
  calendars: CalendarCfg[]
  tasks: ListCfg[]
  meals: ListCfg[]
  lists?: ListCfg[]
  rewards: ListCfg[]
  people?: string[]
  photos?: { intervalSeconds?: number }
  smartHome?: SmartHomeCfg
  dashboard?: DashboardLayout
}

export interface TodoItem {
  uid: string
  summary: string
  status: 'needs_action' | 'completed'
  due?: string
  description?: string
}

export interface CalEvent {
  summary: string
  start: string // ISO datetime or date
  end: string
  allDay: boolean
  calendar: string
  color: string
  dayKeys: string[]
}

export interface WeatherState {
  state: string
  temperature: number | null
  unit: string
}

export interface ForecastDay {
  datetime: string
  condition: string
  temperature: number
  templow: number
}
