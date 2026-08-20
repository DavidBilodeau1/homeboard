import React, { useMemo, useState } from 'react'
import { useStore } from '../store'
import { useFrigate, type FrigateAlert, type FrigateCamera, type FrigateState } from '../frigate'
import {
  AlertsFeed, CameraFocus, CameraTile, FrigateEmpty, HealthStrip, type FocusTarget,
} from '../components/FrigateTiles'

/** Keep only the cameras listed in config (in that order) when one is given. */
const orderCameras = (cams: FrigateCamera[], wanted?: string[]): FrigateCamera[] => {
  if (!wanted?.length) return cams
  return wanted.map((n) => cams.find((c) => c.name === n)).filter((c): c is FrigateCamera => !!c)
}

export function CamerasPage() {
  const { config, t } = useStore()
  const cfg = config?.frigate
  const { state, error, review } = useFrigate((cfg?.pollSeconds ?? 15) * 1000)
  const [focus, setFocus] = useState<FocusTarget | null>(null)

  const view = useMemo<FrigateState | null>(() => {
    if (!state?.enabled) return state
    const cameras = orderCameras(state.cameras, cfg?.cameras)
    const names = new Set(cameras.map((c) => c.name))
    // a camera hidden from the wall shouldn't shout from the alerts feed either
    const alerts = state.alerts.filter((a) => names.has(a.camera)).slice(0, cfg?.alertLimit ?? 20)
    return {
      ...state,
      cameras,
      alerts,
      objects: state.objects.filter((o) => names.has(o.camera)),
      // the "new" counter has to agree with the feed the user is looking at
      summary: state.summary && {
        ...state.summary,
        unreviewed: alerts.filter((a) => !a.reviewed && a.severity === 'alert').length,
      },
    }
  }, [state, cfg?.cameras, cfg?.alertLimit])

  if (!view) {
    return <div className="card page-card"><p className="cal-empty">{error ?? t('frigate.loading')}</p></div>
  }
  if (!view.enabled || !view.cameras.length) return <FrigateEmpty error={error} />

  const latestFor = (name: string) => view.objects.find((o) => o.camera === name)
  const alertsFor = (name: string) =>
    view.alerts.filter((a) => a.camera === name && !a.reviewed && a.severity === 'alert')

  const openAlert = (a: FrigateAlert) => {
    setFocus(a.detections[0]
      ? { camera: a.camera, mode: 'event', eventId: a.detections[0] }
      : { camera: a.camera, mode: 'recap' })
    if (!a.reviewed) review([a.id])
  }

  return (
    <div className="fg-page">
      <HealthStrip state={view} />
      {error && <p className="fg-error">{error}</p>}

      <div className="fg-layout">
        <div className="fg-wall">
          {view.cameras.map((c) => (
            <CameraTile
              key={c.name}
              camera={c}
              health={view.health?.cameras[c.name]}
              alerts={alertsFor(c.name)}
              latest={latestFor(c.name)}
              refreshSeconds={cfg?.refreshSeconds ?? 8}
              onOpen={() => setFocus({ camera: c.name, mode: 'live' })}
            />
          ))}
        </div>

        <AlertsFeed
          state={view}
          onOpen={openAlert}
          onReview={review}
          onReviewAll={() => review(view.alerts.filter((a) => !a.reviewed).map((a) => a.id))}
        />
      </div>

      {focus && (
        <CameraFocus
          target={focus}
          state={view}
          onTarget={setFocus}
          onClose={() => setFocus(null)}
        />
      )}
    </div>
  )
}
