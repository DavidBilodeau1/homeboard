export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const addDays = (d: Date, n: number) => {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1)

export const isSameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b)

/** 42-cell grid (6 weeks) starting on the Sunday on/before the 1st. */
export const monthGrid = (cursor: Date): Date[] => {
  const first = startOfMonth(cursor)
  const start = addDays(first, -first.getDay())
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export const fmtTime = (d: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(d)

export const fmtTopDate = (d: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' }).format(d)

export const fmtLongDate = (d: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(d)

export const fmtMonth = (d: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, { month: 'short' }).format(d)

export const fmtMonthLong = (d: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d)

export const fmtWeekdayShort = (d: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d)

export const weekdayNames = (locale: string): string[] => {
  const base = new Date(2023, 0, 1) // a Sunday
  return Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(addDays(base, i)),
  )
}

export const fmtEventTime = (
  ev: { start: string; end: string; allDay: boolean },
  locale: string,
  allDayLabel = 'All day',
) => {
  if (ev.allDay) return allDayLabel
  const s = new Date(ev.start)
  const e = new Date(ev.end)
  return `${fmtTime(s, locale)} - ${fmtTime(e, locale)}`
}
