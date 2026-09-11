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

export type TileId = 'calendar' | 'calendarFull' | 'photo' | 'tasks' | 'weather' | 'meals' | 'rewards' | 'airQuality' | 'money'

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
}

export interface SmartHomeCfg {
  climate?: string
  sensors?: NamedEntity[]
  lights?: NamedEntity[]
  locks?: NamedEntity[]
  mediaPlayers?: NamedEntity[]
  alarm?: string
}

/** Frigate NVR. Cameras are discovered from Frigate itself; this only tunes
 *  which ones to show and how hard to poll. */
export interface FrigateCfg {
  /** camera names to show, in this order; omit to show every enabled camera */
  cameras?: string[]
  /** snapshot refresh cadence on the camera wall (seconds) */
  refreshSeconds?: number
  /** how often to re-poll alerts, detections and health (seconds) */
  pollSeconds?: number
  /** how many review items to keep in the alerts feed */
  alertLimit?: number
}

/** One Expensave calendar as HomeBoard shows it: color and label for the UI. */
export interface ExpensaveCalendarCfg {
  id: number
  /** overrides the name Expensave gives the calendar */
  name?: string
  color?: string
}

/** Expensave (github.com/algirdasc/expensave) — household transactions. */
export interface ExpensaveCfg {
  /** which calendars to pull; omit/empty to use every calendar on the account */
  calendars?: ExpensaveCalendarCfg[]
  /** ISO 4217 code used to format amounts (default CAD) */
  currency?: string
  /** how far ahead to count already-scheduled money (default 14 days) */
  horizonDays?: number
  /** cash that must stay in the account and is never set aside */
  buffer?: number
  /** optional weekly savings target, shown as progress on the Money page */
  weeklyGoal?: number
  /** show the transactions layer on the calendar by default (default true) */
  showInCalendar?: boolean
}

export interface ExpensaveCalendar {
  id: number
  name: string
  /** Expensave's own total: every confirmed row, including ones dated years
   *  ahead, so it is not what is in the account today */
  balance: number
  /** running balance on the latest day at or before today — the useful one */
  balanceToday?: number | null
  shared: boolean
  owner: string | null
}

export interface TransactionCategory {
  id: number
  name: string
  color: string | null
}

/** One transaction. Expensave's sign convention: income > 0, spending < 0. */
export interface Transaction {
  id: number
  /** Expensave calendar id */
  calendar: number
  label: string
  amount: number
  /** false = planned or not cleared yet, so not in the balance */
  confirmed: boolean
  description: string | null
  category: TransactionCategory | null
  /** local calendar day, YYYY-MM-DD */
  date: string
  at: string | null
  recurring: boolean
  frequency: string | null
}

/** One day of the household ledger; `balance` counts confirmed money only. */
export interface MoneyDay {
  date: string
  income: number
  expense: number
  net: number
  balance: number
}

export interface MoneyPayload {
  start: string
  end: string
  calendars: ExpensaveCalendar[]
  transactions: Transaction[]
  days: MoneyDay[]
  errors: string[]
}

export interface MoneyWeek {
  start: string
  end: string
  income: number
  expense: number
  net: number
  /** part of `net` that has not cleared yet (a projection, not a fact) */
  pending: number
  count: number
  current: boolean
  future: boolean
}

/** What can safely move to savings today — see savingsPlan() in expensave.ts. */
export interface SavingsPlan {
  balance: number
  uncleared: number
  upcomingIn: number
  upcomingOut: number
  /** lowest the account gets between today and the horizon — the real limit */
  low: number
  lowDate: string
  /** balance once every commitment in the window has landed */
  projected: number
  buffer: number
  horizonDays: number
  horizonEnd: string
  setAside: number
  shortfall: number
  commitments: Transaction[]
  unclearedCount: number
}

export interface MoneyState {
  calendars: ExpensaveCalendar[]
  transactions: Transaction[]
  days: MoneyDay[]
  weeks: MoneyWeek[]
  plan: SavingsPlan
  byDay: Map<string, import('./expensave').DayMoney>
  currency: string
  errors: string[]
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
  frigate?: FrigateCfg
  dashboard?: DashboardLayout
  garbage?: GarbageCfg[]
  airQuality?: AirQualityCfg
  floorPlan?: FloorPlanCfg
  expensave?: ExpensaveCfg
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
