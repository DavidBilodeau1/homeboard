import React, { useEffect, useMemo, useState } from 'react'
import { AlertIcon, CameraIcon, DotIcon } from '../../icons'
import { useStore } from '../../store'
import { getMotion, snapshotUrl, timeAgo, type CameraHealth, type FrigateAlert, type FrigateCamera, type FrigateObject } from './api'
import { labelName } from './labels'

const MIN_REFRESH_SECONDS = 2
const MOTION_MINUTES = 60
const MOTION_REFRESH_MS = 60_000

/** A ticking cache-buster that pauses while the tab is hidden. */
function useBust(seconds: number): number {
  const [bust, setBust] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => { if (!document.hidden) setBust(Date.now()) }
    const timer = setInterval(tick, Math.max(MIN_REFRESH_SECONDS, seconds) * 1000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [seconds])
  return bust
}

function useMotion(camera: string, enabled: boolean) {
  const [points, setPoints] = useState<number[]>([])
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const load = () => getMotion(camera, MOTION_MINUTES)
      .then((r) => { if (alive) setPoints(r.points) })
      .catch(() => { if (alive) setPoints([]) })
    load()
    const timer = setInterval(() => { if (!document.hidden) load() }, MOTION_REFRESH_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [camera, enabled])
  return points
}

function Sparkline({ points }: { points: number[] }) {
  const path = useMemo(() => {
    if (points.length < 2) return null
    const max = Math.max(...points, 1)
    const step = 100 / (points.length - 1)
    const coords = points.map((p, i) => `${(i * step).toFixed(2)},${(24 - (p / max) * 22).toFixed(2)}`)
    return { line: coords.join(' '), area: `0,24 ${coords.join(' ')} 100,24` }
  }, [points])
  if (!path) return null
  return (
    <svg className="fg-spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={path.area} />
      <polyline points={path.line} />
    </svg>
  )
}

interface Props {
  camera: FrigateCamera
  health?: CameraHealth
  /** unreviewed alerts on this camera */
  alerts: FrigateAlert[]
  /** latest detection, for the object chip */
  latest?: FrigateObject
  refreshSeconds: number
  showActivity?: boolean
  onOpen: () => void
}

/** Auto-refreshing snapshot with alert and fps badges and an hour of motion activity. */
export function CameraTile({ camera, health, alerts, latest, refreshSeconds, showActivity = true, onOpen }: Props) {
  const { t, locale } = useStore()
  const bust = useBust(refreshSeconds)
  // remembers which refresh failed, so one hiccup doesn't hide the image for good
  const [failedBust, setFailedBust] = useState<number | null>(null)
  const broken = failedBust === bust
  const motion = useMotion(camera.name, showActivity)
  const offline = health?.online === false
  const unread = alerts.length

  return (
    <button className={`fg-tile${offline ? ' offline' : ''}${unread ? ' alerted' : ''}`} onClick={onOpen}>
      {!broken && <img src={snapshotUrl(camera.name, bust)} alt={camera.label} loading="lazy" onError={() => setFailedBust(bust)} />}
      {(broken || offline) && (
        <span className="fg-tile-dead">
          <CameraIcon size={28} />
          {t(offline ? 'frigate.offline' : 'state.unavailable')}
        </span>
      )}

      {showActivity && motion.length > 1 && <Sparkline points={motion} />}

      <span className="fg-tile-top">
        {unread > 0 && <em className="fg-badge alert"><AlertIcon size={13} />{unread}</em>}
        {!!health?.fps && <em className="fg-badge live"><DotIcon size={10} />{Math.round(health.fps)} fps</em>}
      </span>

      <span className="fg-tile-foot">
        <b>{camera.label}</b>
        {latest && (
          <small>
            {labelName(t, latest.label)}
            {latest.subLabel ? ` · ${latest.subLabel}` : ''}
            {' · '}
            {timeAgo(latest.start, locale)}
          </small>
        )}
      </span>
    </button>
  )
}
