import React, { useMemo } from 'react'
import { useStore } from '../store'
import { addMonths, dayKey, fmtEventTime, fmtLongDate, fmtMonthLong, isSameDay, monthGrid, weekdayNames } from '../util'
import { calendarColor, calendarName, fmtChip, fmtMoney, groupByDay, layerId } from '../expensave'
import { ChevronLeft, ChevronRight } from '../icons'
import type { DayMoney } from '../expensave'

/** Shared calendar-page building blocks, reused by CalendarPage and the
 *  full-calendar dashboard tile so both look identical. */

/** Transactions of the Expensave calendars currently switched on, by day. */
const useVisibleMoney = (): { byDay: Map<string, DayMoney>; currency: string } | null => {
  const { money, config, layerVisible } = useStore()
  const showByDefault = config?.expensave?.showInCalendar ?? true
  return useMemo(() => {
    if (!money) return null
    const shown = money.transactions.filter((tx) => layerVisible(layerId(tx.calendar), showByDefault))
    return { byDay: groupByDay(shown), currency: money.currency }
  }, [money, layerVisible, showByDefault])
}

export function MonthGridView() {
  const { locale, t, now, events, monthCursor, setMonthCursor, selectedDate, setSelectedDate } = useStore()
  const grid = useMemo(() => monthGrid(monthCursor), [monthCursor])
  const names = useMemo(() => weekdayNames(locale), [locale])
  const money = useVisibleMoney()
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
          const day = money?.byDay.get(key)
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
              {/* the day's money, in the same place every cell so the eye can scan a column */}
              {day && money && (
                <span className={`calpage-money ${day.net >= 0 ? 'in' : 'out'}`}>
                  {fmtChip(day.net, locale, money.currency)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}

/** Legend chip that switches one calendar layer on or off for this screen. */
function LayerChip({ id, color, label, fallback = true }: {
  id: string
  color: string
  label: string
  fallback?: boolean
}) {
  const { layerVisible, toggleLayer } = useStore()
  const on = layerVisible(id, fallback)
  return (
    <button
      className={`calpage-legend-chip${on ? '' : ' off'}`}
      onClick={() => toggleLayer(id, fallback)}
      aria-pressed={on}
    >
      <i style={{ background: on ? color : 'transparent', borderColor: color }} />
      {label}
    </button>
  )
}

export function DayEventsView() {
  const { locale, t, events, config, selectedDate, money } = useStore()
  const selKey = dayKey(selectedDate)
  const dayEvents = events.filter((e) => e.dayKeys.includes(selKey))
  const visible = useVisibleMoney()
  const day = visible?.byDay.get(selKey)
  const showMoneyByDefault = config?.expensave?.showInCalendar ?? true

  return (
    <>
      <h2 className="card-title">{fmtLongDate(selectedDate, locale)}</h2>
      <div className="calpage-legend">
        {config?.calendars.map((c) => (
          <LayerChip key={c.entity} id={c.entity} color={c.color} label={c.name ?? c.entity} />
        ))}
        {!!config?.garbage?.length && (
          <LayerChip id="garbage" color={config.garbage[0].color} label={t('settings.garbage')} />
        )}
        {money?.calendars.map((c, i) => (
          <LayerChip
            key={`x${c.id}`}
            id={layerId(c.id)}
            color={calendarColor(config?.expensave, c.id, i)}
            label={calendarName(config?.expensave, c)}
            fallback={showMoneyByDefault}
          />
        ))}
      </div>
      <div className="cal-events-list">
        {dayEvents.length === 0 && !day && <div className="cal-empty">{t('calendar.noEvents')}</div>}
        {dayEvents.map((e, i) => (
          <div className="cal-event" key={i}>
            <div className="cal-event-title"><i className="ev-dot" style={{ background: e.color }} />{e.summary}</div>
            <div className="cal-event-time">{fmtEventTime(e, locale, t('calendar.allDay'))}</div>
          </div>
        ))}
        {day && visible && (
          <div className="calpage-day-money">
            <div className="calpage-day-money-head">
              <span>{t('money.dayTotal')}</span>
              <b className={day.net >= 0 ? 'in' : 'out'}>{fmtChip(day.net, locale, visible.currency)}</b>
            </div>
            {day.transactions.map((tx) => (
              <div className={`cal-event mny-line${tx.confirmed ? '' : ' planned'}`} key={tx.id}>
                <div className="cal-event-title">
                  <i className="ev-dot" style={{ background: tx.category?.color ?? 'var(--faint)' }} />
                  {tx.label}
                  {!tx.confirmed && <em className="mny-tag">{t('money.planned')}</em>}
                </div>
                <div className={`cal-event-time mny-amt ${tx.amount >= 0 ? 'in' : 'out'}`}>
                  {fmtMoney(tx.amount, locale, visible.currency)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
