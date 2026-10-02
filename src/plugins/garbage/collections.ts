import type { CalEvent, EntityState, PluginSettings } from '../../types'
import { assigned, dayKey } from '../../util'

export const LAYER_ID = 'garbage'
export const DEFAULT_COLOR = '#3d9b63'
const DAY_MS = 86_400_000

export interface CollectionCfg {
  name: string
  /** a timestamp sensor holding the next pickup date */
  entity: string | null
  color?: string
}

export interface GarbageSettings extends PluginSettings {
  collections?: CollectionCfg[]
}

export interface Collection {
  name: string
  color: string
  day: string | null
  /** 0 = today, 1 = tomorrow, … */
  daysUntil: number | null
}

const midnight = (day: string) => new Date(`${day}T00:00:00`).getTime()

function nextPickup(state: EntityState | null | undefined): string | null {
  const date = state && !['unknown', 'unavailable'].includes(state.state) ? new Date(state.state) : null
  return date && !isNaN(date.getTime()) ? dayKey(date) : null
}

export function upcomingCollections(
  rows: CollectionCfg[],
  states: Record<string, EntityState | null | undefined>,
  today: Date,
): Collection[] {
  const todayKey = dayKey(today)
  return assigned(rows).map(({ name, color = DEFAULT_COLOR, entity }) => {
    const day = nextPickup(states[entity])
    return { name, color, day, daysUntil: day ? Math.round((midnight(day) - midnight(todayKey)) / DAY_MS) : null }
  })
}

export const toCalendarEvents = (collections: Collection[]): CalEvent[] =>
  collections.flatMap(({ name, color, day }) => (day
    ? [{ summary: name, start: `${day}T00:00:00`, end: `${day}T00:00:00`, allDay: true, calendar: LAYER_ID, color, dayKeys: [day] }]
    : []))
