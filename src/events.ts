import type { CalEvent } from './types'
import { addDays, dayKey } from './util'

/** Raw event as returned by the HA calendar API. */
export interface RawCalEvent {
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}

export const normalizeEvents = (raw: RawCalEvent[], entity: string, color: string): CalEvent[] =>
  raw.map((e) => {
    const allDay = !!e.start?.date
    const start: string = e.start?.dateTime ?? e.start?.date ?? ''
    const end: string = e.end?.dateTime ?? e.end?.date ?? start
    const dayKeys: string[] = []
    let d = new Date(allDay ? start + 'T00:00:00' : start)
    // all-day events end on the day AFTER the last day (exclusive)
    const stop = allDay ? addDays(new Date(end + 'T00:00:00'), -1) : new Date(end)
    for (let i = 0; i < 60; i++) {
      dayKeys.push(dayKey(d))
      if (dayKey(d) >= dayKey(stop)) break
      d = addDays(d, 1)
    }
    return { summary: e.summary ?? '(no title)', start, end, allDay, calendar: entity, color, dayKeys }
  })
