import React from 'react'
import { DayEventsView, MonthGridView } from './MonthCalendar'

/** The Calendar page inside one dashboard tile; stacks when the tile is narrow (see .cal-full). */
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
