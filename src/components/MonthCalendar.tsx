import React, { useMemo } from 'react'
import { useActivePlugins } from '../plugins/active'
import { useStore } from '../store'
import type { CalEvent } from '../types'
import { addMonths, dayKey, fmtEventTime, fmtLongDate, fmtMonthLong, isSameDay, monthGrid, weekdayNames } from '../util'
import { ChevronLeft, ChevronRight } from '../icons'
import { LayerChip } from './LayerChip'

const CHIPS_PER_DAY = 3

const groupByDay = (events: CalEvent[]) => {
  const byDay = new Map<string, CalEvent[]>()
  for (const event of events) {
    for (const day of event.dayKeys) byDay.set(day, [...byDay.get(day) ?? [], event])
  }
  return byDay
}

function useCalendarExtensions() {
  const plugins = useActivePlugins()
  return plugins.flatMap((plugin) => (plugin.calendar ? [{ id: plugin.id, ...plugin.calendar }] : []))
}

function MonthNavigation() {
  const { locale, t, now, monthCursor, setMonthCursor, setSelectedDate } = useStore()
  const goToToday = () => {
    setMonthCursor(new Date(now.getFullYear(), now.getMonth(), 1))
    setSelectedDate(now)
  }
  return (
    <div className="calpage-head">
      <h2 className="card-title">{fmtMonthLong(monthCursor, locale)}</h2>
      <div className="calpage-nav">
        <button onClick={() => setMonthCursor(addMonths(monthCursor, -1))} aria-label={t('calendar.prevMonth')}><ChevronLeft /></button>
        <button className="today-btn" onClick={goToToday}>{t('calendar.today')}</button>
        <button onClick={() => setMonthCursor(addMonths(monthCursor, 1))} aria-label={t('calendar.nextMonth')}><ChevronRight /></button>
      </div>
    </div>
  )
}

/** Month grid with event chips; shared by the Calendar page and the full-calendar tile. */
export function MonthGridView() {
  const { locale, now, events, monthCursor, selectedDate, setSelectedDate } = useStore()
  const extensions = useCalendarExtensions()
  const grid = useMemo(() => monthGrid(monthCursor), [monthCursor])
  const names = useMemo(() => weekdayNames(locale), [locale])
  const eventsByDay = useMemo(() => groupByDay(events), [events])
  const selected = dayKey(selectedDate)

  return (
    <>
      <MonthNavigation />
      <div className="calpage-grid calpage-week">
        {names.map((name) => <span key={name}>{name}</span>)}
      </div>
      <div className="calpage-grid calpage-days">
        {grid.map((date) => {
          const day = dayKey(date)
          const dayEvents = eventsByDay.get(day) ?? []
          const classes = ['calpage-day', date.getMonth() === monthCursor.getMonth() ? '' : 'dim', day === selected ? 'sel' : '', isSameDay(date, now) ? 'today' : '']
          return (
            <button key={day} className={classes.join(' ')} onClick={() => setSelectedDate(date)}>
              <span className="calpage-num">{date.getDate()}</span>
              <span className="calpage-chips">
                {dayEvents.slice(0, CHIPS_PER_DAY).map((event, i) => (
                  <span key={i} className="calpage-chip" style={{ background: `${event.color}22`, color: event.color }}>{event.summary}</span>
                ))}
                {dayEvents.length > CHIPS_PER_DAY && <span className="calpage-more">+{dayEvents.length - CHIPS_PER_DAY}</span>}
              </span>
              {extensions.map(({ id, DayBadge }) => DayBadge && <DayBadge key={id} day={day} />)}
            </button>
          )
        })}
      </div>
    </>
  )
}

/** The selected day's events, the layer legend and whatever plugins add for that day. */
export function DayEventsView() {
  const { locale, t, events, config, selectedDate } = useStore()
  const extensions = useCalendarExtensions()
  const day = dayKey(selectedDate)
  const dayEvents = events.filter((event) => event.dayKeys.includes(day))

  return (
    <>
      <h2 className="card-title">{fmtLongDate(selectedDate, locale)}</h2>
      <div className="calpage-legend">
        {config?.calendars?.map((calendar) => (
          <LayerChip key={calendar.entity} id={calendar.entity} color={calendar.color} label={calendar.name ?? calendar.entity} />
        ))}
        {extensions.map(({ id, Legend }) => Legend && <Legend key={id} />)}
      </div>
      <div className="cal-events-list">
        {dayEvents.length === 0 && <div className="cal-empty">{t('calendar.noEvents')}</div>}
        {dayEvents.map((event, i) => (
          <div className="cal-event" key={i}>
            <div className="cal-event-title"><i className="ev-dot" style={{ background: event.color }} />{event.summary}</div>
            <div className="cal-event-time">{fmtEventTime(event, locale, t('calendar.allDay'))}</div>
          </div>
        ))}
        {extensions.map(({ id, DayDetails }) => DayDetails && <DayDetails key={id} day={day} />)}
      </div>
    </>
  )
}
