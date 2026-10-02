import React, { useMemo, useState } from 'react'
import { useStore } from '../../store'
import { usePluginSettings } from '../settings'
import { timeAgo, useFrigate, type FrigateAlert, type FrigateCamera, type FrigateState } from './api'
import { AlertsFeed } from './AlertsFeed'
import { CameraFocus, type FocusTarget } from './CameraFocus'
import { CameraTile } from './CameraTile'
import { HealthStrip } from './HealthStrip'
import { DEFAULTS, type FrigateSettings } from './types'

const isUnreadAlert = (alert: FrigateAlert) => !alert.reviewed && alert.severity === 'alert'

/** The configured cameras in their configured order, or every camera when none are picked. */
const pickCameras = (cameras: FrigateCamera[], wanted?: string[]): FrigateCamera[] =>
  wanted?.length
    ? wanted.map((name) => cameras.find((c) => c.name === name)).filter((c): c is FrigateCamera => !!c)
    : cameras

/** Narrows the state to the picked cameras, so hidden cameras don't show up in the feed or counts. */
function useVisibleState(state: FrigateState | null, settings: FrigateSettings): FrigateState | null {
  return useMemo(() => {
    if (!state?.enabled) return state
    const cameras = pickCameras(state.cameras, settings.cameras)
    const names = new Set(cameras.map((c) => c.name))
    const alerts = state.alerts.filter((a) => names.has(a.camera)).slice(0, settings.alertLimit ?? DEFAULTS.alertLimit)
    return {
      ...state,
      cameras,
      alerts,
      objects: state.objects.filter((o) => names.has(o.camera)),
      summary: state.summary && { ...state.summary, unreviewed: alerts.filter(isUnreadAlert).length },
    }
  }, [state, settings.cameras, settings.alertLimit])
}

function Notice({ text }: { text: string }) {
  return <div className="card page-card"><p className="cal-empty">{text}</p></div>
}

export function CamerasPage() {
  const { t, locale } = useStore()
  const settings = usePluginSettings<FrigateSettings>('frigate')
  const { state, error, review, fetchedAt, stale } = useFrigate((settings.pollSeconds ?? DEFAULTS.pollSeconds) * 1000)
  const view = useVisibleState(state, settings)
  const [focus, setFocus] = useState<FocusTarget | null>(null)

  if (!view) return <Notice text={error ?? t('frigate.loading')} />
  if (!view.cameras.length) return <Notice text={error ?? t('frigate.noCameras')} />

  const openAlert = (alert: FrigateAlert) => {
    const eventId = alert.detections[0]
    setFocus(eventId ? { camera: alert.camera, mode: 'event', eventId } : { camera: alert.camera, mode: 'recap' })
    if (!alert.reviewed) review([alert.id])
  }

  return (
    <div className="fg-page">
      <HealthStrip state={view} />
      {(stale || error) && (
        <p className="fg-error">
          {stale && t('frigate.stale', { ago: timeAgo((fetchedAt ?? 0) / 1000, locale) })}
          {stale && error ? ' · ' : ''}
          {error}
        </p>
      )}

      <div className="fg-layout">
        <div className="fg-wall">
          {view.cameras.map((camera) => (
            <CameraTile
              key={camera.name}
              camera={camera}
              health={view.health?.cameras[camera.name]}
              alerts={view.alerts.filter((a) => a.camera === camera.name && isUnreadAlert(a))}
              latest={view.objects.find((o) => o.camera === camera.name)}
              refreshSeconds={settings.refreshSeconds ?? DEFAULTS.refreshSeconds}
              onOpen={() => setFocus({ camera: camera.name, mode: 'live' })}
            />
          ))}
        </div>
        <AlertsFeed state={view} onOpen={openAlert} onReview={review} />
      </div>

      {focus && <CameraFocus target={focus} state={view} onTarget={setFocus} onClose={() => setFocus(null)} />}
    </div>
  )
}
