import { describe, it, expect } from 'vitest'
import { normalizeEvents } from './events'

const one = (raw: Parameters<typeof normalizeEvents>[0][number]) =>
  normalizeEvents([raw], 'calendar.test', '#c33c54')[0]

describe('normalizeEvents', () => {
  it('maps a timed event on a single day to one dayKey', () => {
    const e = one({
      summary: 'Dentist',
      start: { dateTime: '2026-07-15T10:00:00-04:00' },
      end: { dateTime: '2026-07-15T11:00:00-04:00' },
    })
    expect(e.allDay).toBe(false)
    expect(e.summary).toBe('Dentist')
    expect(e.calendar).toBe('calendar.test')
    expect(e.dayKeys).toEqual(['2026-07-15'])
  })

  it('spans a timed multi-day event across each day', () => {
    const e = one({
      summary: 'Trip',
      start: { dateTime: '2026-07-15T18:00:00' },
      end: { dateTime: '2026-07-17T09:00:00' },
    })
    expect(e.dayKeys).toEqual(['2026-07-15', '2026-07-16', '2026-07-17'])
  })

  it('treats a single all-day event as one day (exclusive end)', () => {
    const e = one({
      summary: 'Recycling',
      start: { date: '2026-07-15' },
      end: { date: '2026-07-16' },
    })
    expect(e.allDay).toBe(true)
    expect(e.dayKeys).toEqual(['2026-07-15'])
  })

  it('drops the exclusive end day of a multi-day all-day event', () => {
    const e = one({
      summary: 'Weekend at the chalet',
      start: { date: '2026-07-17' },
      end: { date: '2026-07-20' },
    })
    expect(e.dayKeys).toEqual(['2026-07-17', '2026-07-18', '2026-07-19'])
  })

  it('caps runaway events at 60 days', () => {
    const e = one({
      summary: 'Sabbatical',
      start: { date: '2026-01-01' },
      end: { date: '2027-01-01' },
    })
    expect(e.dayKeys).toHaveLength(60)
    expect(e.dayKeys[0]).toBe('2026-01-01')
  })

  it('defaults a missing summary and missing end', () => {
    const e = one({ start: { dateTime: '2026-07-15T10:00:00' } })
    expect(e.summary).toBe('(no title)')
    expect(e.end).toBe(e.start)
    expect(e.dayKeys).toEqual(['2026-07-15'])
  })
})
