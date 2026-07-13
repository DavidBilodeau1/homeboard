import React from 'react'
import { useStore } from '../store'
import { WeatherIcon } from '../icons'
import { fmtWeekdayShort } from '../util'

export function WeatherCard() {
  const { weather, forecast, systemInfo, locale, t } = useStore()
  const today = forecast[0]
  const unit = weather?.unit ?? '°'
  const curTemp = weather?.temperature != null
    ? Math.round(weather.temperature)
    : today ? Math.round(today.temperature) : null
  const days = forecast.slice(0, 7)

  return (
    <section className="card weather-card">
      <div className="wx-current">
        <span className="wx-cur-icon">
          <WeatherIcon condition={weather?.state ?? today?.condition ?? ''} size={44} />
        </span>
        <span className="wx-cur-temp">{curTemp != null ? curTemp : '--'}<em>{unit}</em></span>
        <span className="wx-cur-meta">
          <span className="wx-loc">{systemInfo?.location_name ?? '—'}</span>
          {today && (
            <span className="wx-hilo">{Math.round(today.temperature)}° / {Math.round(today.templow)}°</span>
          )}
        </span>
      </div>
      <div className="wx-forecast">
        {days.length === 0 && <div className="cal-empty">—</div>}
        {days.map((d, i) => (
          <div className="wx-day" key={d.datetime}>
            <span className="wx-day-name">
              {i === 0 ? t('weather.today') : fmtWeekdayShort(new Date(d.datetime), locale)}
            </span>
            <WeatherIcon condition={d.condition} size={26} />
            <span className="wx-day-temps"><b>{Math.round(d.temperature)}°</b><i>{Math.round(d.templow)}°</i></span>
          </div>
        ))}
      </div>
    </section>
  )
}
