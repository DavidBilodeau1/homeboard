import React from 'react'
import { ChipIcon, ClockIcon, DiskIcon } from '../../icons'
import { useStore } from '../../store'
import { duration, type FrigateState } from './api'

function Stat({ value, name, accent, children }: { value: React.ReactNode; name: React.ReactNode; accent?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`fg-stat${accent ? ' accent' : ''}`}>
      <span className="fg-stat-value">{value}</span>
      <span className="fg-stat-name">{name}</span>
      {children}
    </div>
  )
}

/** Alert counts, cameras up, detector speed, disk usage and uptime. */
export function HealthStrip({ state }: { state: FrigateState }) {
  const { t } = useStore()
  const health = state.health
  const cameras = state.cameras
  const online = cameras.filter((c) => health?.cameras[c.name]?.online !== false).length
  const detector = health?.detectors[0]
  const storage = health?.storage
  const updatable = health?.latestVersion && health.version && !health.version.startsWith(health.latestVersion)

  return (
    <div className="fg-health">
      <Stat accent value={state.summary?.unreviewed ?? 0} name={t('frigate.unreviewed')} />
      <Stat value={state.summary?.alerts24h ?? '—'} name={t('frigate.alerts24h')} />
      <Stat value={state.summary?.detections24h ?? '—'} name={t('frigate.detections24h')} />
      <Stat value={`${online}/${cameras.length}`} name={t('frigate.camerasOnline')} />
      {detector && (
        <Stat value={<><ChipIcon size={15} />{detector.inferenceSpeed?.toFixed(1) ?? '—'}<em>ms</em></>} name={detector.name} />
      )}
      {storage && (
        <Stat
          value={<><DiskIcon size={15} />{storage.usedPct ?? '—'}<em>%</em></>}
          name={storage.usedGb != null && storage.totalGb != null
            ? `${Math.round(storage.usedGb)} / ${Math.round(storage.totalGb)} GB`
            : t('frigate.storage')}
        >
          <span className="fg-stat-bar"><i style={{ width: `${storage.usedPct ?? 0}%` }} /></span>
        </Stat>
      )}
      {health?.uptime != null && (
        <Stat
          value={<><ClockIcon size={15} />{duration(health.uptime)}</>}
          name={`${health.version ?? t('frigate.uptime')}${updatable ? ` → ${health.latestVersion}` : ''}`}
        />
      )}
    </div>
  )
}
