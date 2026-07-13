import React, { useMemo } from 'react'
import { useStore } from '../store'
import { addMonths, dayKey, fmtEventTime, fmtLongDate, fmtMonthLong, isSameDay, monthGrid, weekdayNames } from '../util'
import { ChevronLeft, ChevronRight } from '../icons'

/** Shared calendar-page building blocks, reused by CalendarPage and the
 *  full-calendar dashboard tile so both look identical. */

export function MonthGridView() {
  const { locale, t, now, events, monthCursor, setMonthCursor, selectedDate, setSelectedDate } = useStore()
  const grid = useMemo(() => monthGrid(monthCursor), [monthCursor])
  const names = useMemo(() => weekdayNames(locale), [locale])
  const byDay = useMemo(() => {
    const m = new Map<string, typeof events>()
    for (const e of events) for (const k of e.dayKeys) {
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(e)
    }
    return m
  }, [events])
  const selKey = dayKey(selectedDate)

  return (
    <>
      <div className="calpage-head">
        <h2 className="card-title">{fmtMonthLong(monthCursor, locale)}</h2>
        <div className="calpage-nav">
          <button onClick={() => setMonthCursor(addMonths(monthCursor, -1))} aria-label={t('calendar.prevMonth')}><ChevronLeft /></button>
          <button className="today-btn" onClick={() => { setMonthCursor(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedDate(now) }}>{t('calendar.today')}</button>
          <button onClick={() => setMonthCursor(addMonths(monthCursor, 1))} aria-label={t('calendar.nextMonth')}><ChevronRight /></button>
        </div>
      </div>
      <div className="calpage-grid calpage-week">
        {names.map((n) => <span key={n}>{n}</span>)}
      </div>
      <div className="calpage-grid calpage-days">
        {grid.map((d) => {
          const key = dayKey(d)
          const inMonth = d.getMonth() === monthCursor.getMonth()
          const evs = byDay.get(key) ?? []
          return (
            <button
              key={key}
              className={['calpage-day', inMonth ? '' : 'dim', key === selKey ? 'sel' : '', isSameDay(d, now) ? 'today' : ''].join(' ')}
              onClick={() => setSelectedDate(d)}
            >
              <span className="calpage-num">{d.getDate()}</span>
              <span className="calpage-chips">
                {evs.slice(0, 3).map((e, i) => (
                  <span key={i} className="calpage-chip" style={{ background: `${e.color}22`, color: e.color }}>
                    {e.summary}
                  </span>
                ))}
                {evs.length > 3 && <span className="calpage-more">+{evs.length - 3}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

export function DayEventsView() {
  const { locale, t, events, config, selectedDate } = useStore()
  const selKey = dayKey(selectedDate)
  const dayEvents = events.filter((e) => e.dayKeys.includes(selKey))

  return (
    <>
      <h2 className="card-title">{fmtLongDate(selectedDate, locale)}</h2>
      <div className="calpage-legend">
        {config?.calendars.map((c) => (
          <span key={c.entity}><i style={{ background: c.color }} />{c.name ?? c.entity}</span>
        ))}
      </div>
      <div className="cal-events-list">
        {dayEvents.length === 0 && <div className="cal-empty">{t('calendar.noEvents')}</div>}
        {dayEvents.map((e, i) => (
          <div className="cal-event" key={i}>
            <div className="cal-event-title"><i className="ev-dot" style={{ background: e.color }} />{e.summary}</div>
            <div className="cal-event-time">{fmtEventTime(e, locale, t('calendar.allDay'))}</div>
          </div>
        ))}
      </div>
    </>
  )
}
