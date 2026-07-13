import React from 'react'
import { MonthGridView, DayEventsView } from './MonthCalendar'

/** Dashboard tile that mirrors the Calendar page: full month grid with event
 *  chips plus a day-detail panel, all inside one tile. The month/detail split
 *  collapses to stacked when the tile is narrow (see .cal-full CSS). */
export function CalendarFullCard() {
  return (
    <section className="card cal-full-card">
      <div className="cal-full">
        <div className="cal-full-main">
          <MonthGridView />
        </div>
        <div className="cal-full-side">
          <DayEventsView />
        </div>
      </div>
    </section>
  )
}
