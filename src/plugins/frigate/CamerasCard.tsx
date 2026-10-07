import React from 'react'
import { AlertIcon } from '../../icons'
import { navigate } from '../../navigation'
import { useStore } from '../../store'
import { useFrigate, type FrigateAlert } from './api'
import { CameraTile } from './CameraTile'

const POLL_MS = 30_000
const SNAPSHOT_SECONDS = 10
const CAMERAS_SHOWN = 4

const isUnreadAlert = (alert: FrigateAlert) => !alert.reviewed && alert.severity === 'alert'

/** A few snapshots on the Home page; the full wall lives on the Cameras page. */
export function CamerasCard() {
  const { t } = useStore()
  const { state } = useFrigate(POLL_MS)
  if (!state?.cameras.length) return null

  const unread = state.alerts.filter(isUnreadAlert)
  const openCameras = () => navigate('cameras')

  return (
    <section className="card sh-cameras">
      <h2 className="card-title">
        {t('frigate.homeCard')}
        <a className="fg-more" href="#/cameras">
          {unread.length > 0 && <em className="fg-badge alert"><AlertIcon size={12} />{unread.length}</em>}
          {t('frigate.viewAll')}
        </a>
      </h2>
      <div className="fg-wall compact">
        {state.cameras.slice(0, CAMERAS_SHOWN).map((camera) => (
          <CameraTile
            key={camera.name}
            camera={camera}
            health={state.health?.cameras[camera.name]}
            alerts={unread.filter((a) => a.camera === camera.name)}
            latest={state.objects.find((o) => o.camera === camera.name)}
            refreshSeconds={SNAPSHOT_SECONDS}
            showActivity={false}
            onOpen={openCameras}
          />
        ))}
      </div>
    </section>
  )
}
