import React from 'react'
import { AirIcon, AlertIcon } from '../../icons'
import { useStore } from '../../store'
import { useAirQuality } from './useAirQuality'

/** The index in the header; a pulsing alert when the air is unsafe. */
export function AirQualityBadge() {
  const { t } = useStore()
  const air = useAirQuality()
  if (air?.value == null) return null

  if (air.safe) {
    return <span className="tb-air-ok" title={air.name}><AirIcon size={17} />{air.value}</span>
  }
  return (
    <span className="tb-airalert" style={{ background: air.color }}>
      <AlertIcon size={18} />
      {air.name} {air.value} · {t('air.stayInside')}
    </span>
  )
}
