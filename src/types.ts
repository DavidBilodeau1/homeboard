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

export interface DashboardTile {
  id: string
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
  /** null while the row is being set up in Settings */
  entity: string | null
  icon?: string
}

export type AssignedEntity = NamedEntity & { entity: string }

export interface SmartHomeCfg {
  climate?: string
  sensors?: NamedEntity[]
  lights?: NamedEntity[]
  locks?: NamedEntity[]
  mediaPlayers?: NamedEntity[]
  alarm?: string
}

export interface PluginSettings {
  enabled?: boolean
}

export interface AppConfig {
  locale?: string
  language?: string
  theme?: ThemeMode
  weatherEntity?: string
  calendars?: CalendarCfg[]
  tasks?: ListCfg[]
  meals?: ListCfg[]
  lists?: ListCfg[]
  rewards?: ListCfg[]
  people?: string[]
  photos?: { intervalSeconds?: number }
  smartHome?: SmartHomeCfg
  dashboard?: DashboardLayout
  plugins?: Record<string, PluginSettings>
}

export interface ServerMeta {
  editorEnabled: boolean
  mock: boolean
  authEnabled: boolean
  user: string | null
  plugins: Record<string, { available: boolean }>
}

export interface EntityState {
  state: string
  attributes: Record<string, unknown>
}

export interface PersonState {
  entity: string
  name: string
  state: string
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
  /** ISO datetime, or a date for all-day events */
  start: string
  end: string
  allDay: boolean
  /** source layer: an HA calendar entity or a plugin's layer id */
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
