import React from 'react'
import { useStore } from '../store'
import { aqiColor } from '../util'
import { AirIcon, AlertIcon } from '../icons'

export function AirQualityCard() {
  const { airQuality, t } = useStore()
  if (!airQuality) return null
  const { value, safeMax, name } = airQuality
  const known = value != null
  const safe = known && value <= safeMax
  const color = known ? aqiColor(value, safeMax) : 'var(--muted)'

  return (
    <section
      className={`card aq-card${known && !safe ? ' unsafe' : ''}`}
      style={{ '--aq': color } as React.CSSProperties}
    >
      <h2 className="card-title">{name}</h2>
      <div className="aq-body">
        <span className="aq-value">{known ? value : '–'}</span>
        <span className="aq-status">
          {safe ? <AirIcon size={22} /> : <AlertIcon size={24} />}
          {!known ? t('state.unavailable') : safe ? t('air.good') : t('air.unsafe')}
        </span>
      </div>
      {known && !safe && (
        <div className="aq-warning"><AlertIcon size={18} /> {t('air.stayInside')}</div>
      )}
    </section>
  )
}
