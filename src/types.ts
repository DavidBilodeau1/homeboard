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

export type TileId = 'calendar' | 'calendarFull' | 'photo' | 'tasks' | 'weather' | 'meals' | 'rewards' | 'airQuality'

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

export interface GarbageCfg {
  name: string
  entity: string // a `device_class: timestamp` sensor holding the next collection date
  color: string
}

export interface GarbageCollection {
  name: string
  color: string
  dayKey: string | null   // local calendar day of the next collection
  daysUntil: number | null // 0 = today, 1 = tomorrow, …
}

export interface AirQualityCfg {
  entity: string
  name?: string
  safeMax?: number // AQI at or below this is "safe"; above it is flagged unsafe
}

export interface AirQualityState {
  value: number | null
  safeMax: number
  name: string
}

/** A [feet, inches] measurement, e.g. [10, 6] = 10′6″. */
export type FeetInches = [number, number]

export interface FloorPlanRoomCfg {
  id: string
  /** i18n key under `room.` (living, kitchen, bedroom, …); translated for display */
  type?: string
  /** explicit label; overrides the translated `type` */
  name?: string
  /** disambiguating suffix, e.g. "1" */
  tag?: string
  /** i18n key under `note.` for a feature line (dishwasherIsland, showerSink, …) */
  note?: string
  w: FeetInches
  h: FeetInches
  /** default position on the plan (plan units); optional, dragging overrides it */
  x?: number
  y?: number
}

export interface FloorPlanFloorCfg {
  id: string
  /** label; falls back to the `floorplan.<id>` translation */
  name?: string
  rooms: FloorPlanRoomCfg[]
}

export interface FloorPlanExteriorCfg {
  id: string
  shape: 'circle' | 'rect'
  /** i18n key under `floorplan.` (pool, shed); translated for display */
  type?: string
  name?: string
  w: FeetInches
  h: FeetInches
  x?: number
  y?: number
}

/** A room/feature's placement override once dragged (plan units). */
export interface FloorPlanPlacement { x: number; y: number; rot?: boolean }

/** A Home Assistant entity dropped on the plan. x/y is the marker centre. */
export interface FloorDevice { id: string; entity: string; floor: string; x: number; y: number }

export interface FloorPlanCfg {
  /** exterior footprint, to scale (from the certificate of location) */
  house?: { w: FeetInches; h: FeetInches; x?: number; y?: number }
  floors?: FloorPlanFloorCfg[]
  /** site features shown around the ground floor (pool, shed) */
  exterior?: FloorPlanExteriorCfg[]
  /** per-room/feature drag positions & rotation, keyed by id */
  layout?: Record<string, FloorPlanPlacement>
  /** placed devices (shared across all screens) */
  devices?: FloorDevice[]
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
  garbage?: GarbageCfg[]
  airQuality?: AirQualityCfg
  floorPlan?: FloorPlanCfg
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
  garbage?: boolean // synthetic garbage-collection event
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
