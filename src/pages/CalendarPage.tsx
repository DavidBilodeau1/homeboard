import React from 'react'
import { MonthGridView, DayEventsView } from '../components/MonthCalendar'

export function CalendarPage() {
  return (
    <div className="calpage">
      <div className="card calpage-main">
        <MonthGridView />
      </div>
      <div className="card calpage-side">
        <DayEventsView />
      </div>
    </div>
  )
}
