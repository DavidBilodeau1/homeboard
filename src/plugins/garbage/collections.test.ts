import { describe, expect, it } from 'vitest'
import { toCalendarEvents, upcomingCollections } from './collections'

const TODAY = new Date(2026, 9, 2, 15, 30)
const rows = [
  { name: 'Recycling', entity: 'sensor.recycling', color: '#4a7dd6' },
  { name: 'Trash', entity: 'sensor.trash', color: '#3d9b63' },
]
const at = (iso: string) => ({ state: iso, attributes: {} })

describe('upcomingCollections', () => {
  it('counts whole days until each pickup, whatever the time of day', () => {
    const states = {
      'sensor.recycling': at(new Date(2026, 9, 3, 0, 0).toISOString()),
      'sensor.trash': at(new Date(2026, 9, 2, 6, 0).toISOString()),
    }
    expect(upcomingCollections(rows, states, TODAY).map((c) => [c.name, c.day, c.daysUntil])).toEqual([
      ['Recycling', '2026-10-03', 1],
      ['Trash', '2026-10-02', 0],
    ])
  })

  it('leaves the day unknown for missing or unavailable sensors', () => {
    const collections = upcomingCollections(rows, { 'sensor.trash': at('unavailable') }, TODAY)
    expect(collections.map((c) => c.daysUntil)).toEqual([null, null])
  })
})

describe('toCalendarEvents', () => {
  it('turns known pickups into all-day events on the garbage layer', () => {
    const events = toCalendarEvents([
      { name: 'Trash', color: '#3d9b63', day: '2026-10-05', daysUntil: 3 },
      { name: 'Compost', color: '#8a5a3b', day: null, daysUntil: null },
    ])
    expect(events).toEqual([{
      summary: 'Trash', start: '2026-10-05T00:00:00', end: '2026-10-05T00:00:00',
      allDay: true, calendar: 'garbage', color: '#3d9b63', dayKeys: ['2026-10-05'],
    }])
  })
})
