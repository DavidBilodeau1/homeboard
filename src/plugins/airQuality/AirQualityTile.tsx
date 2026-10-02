import React from 'react'
import { AirIcon, AlertIcon } from '../../icons'
import { useStore } from '../../store'
import { useAirQuality } from './useAirQuality'

export function AirQualityTile() {
  const { t } = useStore()
  const air = useAirQuality()
  if (!air) return null
  const known = air.value != null
  const status = !known ? t('state.unavailable') : air.safe ? t('air.good') : t('air.unsafe')

  return (
    <section className={`card aq-card${air.safe ? '' : ' unsafe'}`} style={{ '--aq': air.color } as React.CSSProperties}>
      <h2 className="card-title">{air.name}</h2>
      <div className="aq-body">
        <span className="aq-value">{known ? air.value : '–'}</span>
        <span className="aq-status">
          {air.safe ? <AirIcon size={22} /> : <AlertIcon size={24} />}
          {status}
        </span>
      </div>
      {!air.safe && <div className="aq-warning"><AlertIcon size={18} /> {t('air.stayInside')}</div>}
    </section>
  )
}
