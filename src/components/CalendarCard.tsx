import React, { useMemo } from 'react'
import { useStore } from '../store'
import { dayKey, fmtEventTime, fmtLongDate, fmtMonth, isSameDay, monthGrid, weekdayNames } from '../util'

export function CalendarCard() {
  const { locale, t, now, events, monthCursor, selectedDate, setSelectedDate } = useStore()
  const grid = useMemo(() => monthGrid(monthCursor), [monthCursor])
  const names = useMemo(() => weekdayNames(locale), [locale])
  const eventDays = useMemo(() => new Set(events.flatMap((e) => e.dayKeys)), [events])
  const selKey = dayKey(selectedDate)
  const dayEvents = events.filter((e) => e.dayKeys.includes(selKey))

  return (
    <section className="card cal-card">
      <h2 className="card-title">{t('card.calendar')}</h2>
      <div className="cal-month-label">
        <b>{fmtMonth(monthCursor, locale)}</b> <span>{monthCursor.getFullYear()}</span>
      </div>
      <div className="cal-grid cal-head">
        {names.map((n) => <span key={n}>{n}</span>)}
      </div>
      <div className="cal-grid cal-days">
        {grid.map((d) => {
          const inMonth = d.getMonth() === monthCursor.getMonth()
          const key = dayKey(d)
          const selected = key === selKey
          const today = isSameDay(d, now)
          return (
            <button
              key={key}
              className={[
                'cal-day',
                inMonth ? '' : 'dim',
                selected ? 'sel' : '',
                today && !selected ? 'today' : '',
              ].join(' ')}
              onClick={() => setSelectedDate(d)}
            >
              <span className="cal-num">{d.getDate()}</span>
              {inMonth && eventDays.has(key) && <span className="cal-dot" />}
            </button>
          )
        })}
      </div>
      <div className="cal-events">
        <div className="cal-events-date">{fmtLongDate(selectedDate, locale)}</div>
        <div className="cal-events-label"><span className="red-dot" /> {t('calendar.events')}</div>
        <div className="cal-events-list">
          {dayEvents.length === 0 && <div className="cal-empty">{t('calendar.noEvents')}</div>}
          {dayEvents.map((e, i) => (
            <div className="cal-event" key={i}>
              <div className="cal-event-title">{e.summary}</div>
              <div className="cal-event-time">{fmtEventTime(e, locale, t('calendar.allDay'))}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
