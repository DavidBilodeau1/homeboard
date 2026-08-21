import React, { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import {
  CameraIcon, AlertIcon, MotionIcon, ChipIcon, DiskIcon, ClockIcon,
  CheckIcon, PlayIcon, FilmIcon, DotIcon, CloseIcon,
} from '../icons'
import {
  type FrigateAlert, type FrigateCamera, type FrigateObject, type FrigateState, type CameraHealth,
  clockTime, duration, eventClipUrl, eventSnapshotUrl, eventThumbUrl, getMotion, liveUrl,
  recapUrl, reviewPreviewUrl, snapshotUrl, timeAgo,
} from '../frigate'
import type { Translate } from '../i18n'

/** Object labels come from Frigate in English; translate when we have a word. */
export const labelName = (t: Translate, label: string): string => {
  const key = `label.${label}`
  const s = t(key)
  return s === key ? label.replace(/_/g, ' ') : s
}

/** Ticking counter used as a cache-buster; pauses while the tab is hidden. */
export function useBust(seconds: number): number {
  const [bust, setBust] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => { if (!document.hidden) setBust(Date.now()) }
    const timer = setInterval(tick, Math.max(2, seconds) * 1000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick) }
  }, [seconds])
  return bust
}

// ---------- motion sparkline ----------
function Sparkline({ points }: { points: number[] }) {
  const path = useMemo(() => {
    if (points.length < 2) return null
    const max = Math.max(...points, 1)
    const step = 100 / (points.length - 1)
    const pts = points.map((p, i) => `${(i * step).toFixed(2)},${(24 - (p / max) * 22).toFixed(2)}`)
    return { line: pts.join(' '), area: `0,24 ${pts.join(' ')} 100,24` }
  }, [points])
  if (!path) return null
  return (
    <svg className="fg-spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={path.area} />
      <polyline points={path.line} />
    </svg>
  )
}

/** Motion activity for the last hour, refreshed on its own slow cadence. */
function useMotion(camera: string, enabled: boolean) {
  const [points, setPoints] = useState<number[]>([])
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const load = () => getMotion(camera, 60)
      .then((r) => { if (alive) setPoints(r.points) })
      .catch(() => { if (alive) setPoints([]) })
    load()
    const t = setInterval(() => { if (!document.hidden) load() }, 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [camera, enabled])
  return points
}

// ---------- camera tile ----------
interface TileProps {
  camera: FrigateCamera
  health?: CameraHealth
  /** unreviewed alerts on this camera */
  alerts: FrigateAlert[]
  /** most recent detection on this camera, for the object chip */
  latest?: FrigateObject
  refreshSeconds: number
  showActivity?: boolean
  onOpen: () => void
}

export function CameraTile({ camera, health, alerts, latest, refreshSeconds, showActivity = true, onOpen }: TileProps) {
  const { t, locale } = useStore()
  const bust = useBust(refreshSeconds)
  // Which refresh failed, rather than a sticky flag: one hiccup used to unmount
  // the image for good, so the tile stayed dead until the page was reloaded.
  const [failedBust, setFailedBust] = useState<number | null>(null)
  const broken = failedBust === bust
  const motion = useMotion(camera.name, showActivity)
  const offline = health?.online === false
  const unread = alerts.length

  return (
    <button className={`fg-tile${offline ? ' offline' : ''}${unread ? ' alerted' : ''}`} onClick={onOpen}>
      {!broken && (
        <img
          src={snapshotUrl(camera.name, bust)}
          alt={camera.label}
          loading="lazy"
          onError={() => setFailedBust(bust)}
        />
      )}
      {(broken || offline) && (
        <span className="fg-tile-dead">
          <CameraIcon size={28} />
          {t(offline ? 'frigate.offline' : 'state.unavailable')}
        </span>
      )}

      {showActivity && motion.length > 1 && <Sparkline points={motion} />}

      <span className="fg-tile-top">
        {unread > 0 && (
          <em className="fg-badge alert"><AlertIcon size={13} />{unread}</em>
        )}
        {health?.fps ? (
          <em className="fg-badge live"><DotIcon size={10} />{Math.round(health.fps)} fps</em>
        ) : null}
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

// ---------- alerts feed ----------
interface AlertRowProps {
  alert: FrigateAlert
  cameraLabel: string
  onOpen: () => void
  onReview: () => void
}

function AlertRow({ alert, cameraLabel, onOpen, onReview }: AlertRowProps) {
  const { t, locale } = useStore()
  // hovering (or focusing, on a touch panel) swaps the still for the animation
  const [animate, setAnimate] = useState(false)
  const still = alert.detections[0] ? eventThumbUrl(alert.detections[0]) : reviewPreviewUrl(alert.id)
  const [src, setSrc] = useState(still)

  useEffect(() => {
    setSrc(animate ? reviewPreviewUrl(alert.id) : still)
  }, [animate, alert.id, still])

  const objects = alert.objects.length ? alert.objects : alert.audio
  return (
    <li
      className={`fg-alert${alert.reviewed ? ' seen' : ''} sev-${alert.severity}`}
      onMouseEnter={() => setAnimate(true)}
      onMouseLeave={() => setAnimate(false)}
    >
      <button className="fg-alert-main" onClick={onOpen}>
        <span className="fg-alert-thumb">
          <img src={src} alt="" loading="lazy" onError={() => setSrc(still)} />
          {!alert.reviewed && <i className="fg-unread" />}
        </span>
        <span className="fg-alert-text">
          <b>
            {objects.map((o) => labelName(t, o)).join(', ') || t(`frigate.severity.${alert.severity}`)}
            {alert.subLabels.length ? ` · ${alert.subLabels.join(', ')}` : ''}
          </b>
          <small>
            {cameraLabel}
            {alert.zones.length ? ` · ${alert.zones.join(', ')}` : ''}
          </small>
          <small className="fg-alert-when">
            {clockTime(alert.start, locale)} · {timeAgo(alert.start, locale)}
          </small>
        </span>
      </button>
      {!alert.reviewed && (
        <button className="fg-alert-ack" title={t('frigate.markReviewed')} onClick={onReview}>
          <CheckIcon size={16} />
        </button>
      )}
    </li>
  )
}

export function AlertsFeed({
  state, onOpen, onReview, onReviewAll,
}: {
  state: FrigateState
  onOpen: (a: FrigateAlert) => void
  onReview: (ids: string[]) => void
  onReviewAll: () => void
}) {
  const { t } = useStore()
  const labels = useMemo(
    () => Object.fromEntries(state.cameras.map((c) => [c.name, c.label])),
    [state.cameras],
  )
  const unread = state.alerts.filter((a) => !a.reviewed)

  return (
    <section className="card fg-feed">
      <h2 className="card-title">
        {t('frigate.alerts')}
        {unread.length > 0 && (
          <button className="fg-ackall" onClick={onReviewAll}>
            <CheckIcon size={14} /> {t('frigate.markAllReviewed')}
          </button>
        )}
      </h2>
      {state.alerts.length === 0 ? (
        <p className="cal-empty">{t('frigate.noAlerts')}</p>
      ) : (
        <ul className="fg-alerts">
          {state.alerts.map((a) => (
            <AlertRow
              key={a.id}
              alert={a}
              cameraLabel={labels[a.camera] ?? a.camera}
              onOpen={() => onOpen(a)}
              onReview={() => onReview([a.id])}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------- health strip ----------
export function HealthStrip({ state }: { state: FrigateState }) {
  const { t } = useStore()
  const h = state.health
  const cams = state.cameras
  const online = cams.filter((c) => h?.cameras[c.name]?.online !== false).length
  const detector = h?.detectors[0]
  const updatable = h?.latestVersion && h.version && !h.version.startsWith(h.latestVersion)

  return (
    <div className="fg-health">
      <div className="fg-stat accent">
        <span className="fg-stat-value">{state.summary?.unreviewed ?? 0}</span>
        <span className="fg-stat-name">{t('frigate.unreviewed')}</span>
      </div>
      <div className="fg-stat">
        <span className="fg-stat-value">{state.summary?.alerts24h ?? '—'}</span>
        <span className="fg-stat-name">{t('frigate.alerts24h')}</span>
      </div>
      <div className="fg-stat">
        <span className="fg-stat-value">{state.summary?.detections24h ?? '—'}</span>
        <span className="fg-stat-name">{t('frigate.detections24h')}</span>
      </div>
      <div className="fg-stat">
        <span className="fg-stat-value">{online}/{cams.length}</span>
        <span className="fg-stat-name">{t('frigate.camerasOnline')}</span>
      </div>
      {detector && (
        <div className="fg-stat">
          <span className="fg-stat-value">
            <ChipIcon size={15} />{detector.inferenceSpeed?.toFixed(1) ?? '—'}<em>ms</em>
          </span>
          <span className="fg-stat-name">{detector.name}</span>
        </div>
      )}
      {h?.storage && (
        <div className="fg-stat">
          <span className="fg-stat-value"><DiskIcon size={15} />{h.storage.usedPct ?? '—'}<em>%</em></span>
          <span className="fg-stat-name">
            {h.storage.usedGb != null && h.storage.totalGb != null
              ? `${Math.round(h.storage.usedGb)} / ${Math.round(h.storage.totalGb)} GB`
              : t('frigate.storage')}
          </span>
          <span className="fg-stat-bar"><i style={{ width: `${h.storage.usedPct ?? 0}%` }} /></span>
        </div>
      )}
      {h?.uptime != null && (
        <div className="fg-stat">
          <span className="fg-stat-value"><ClockIcon size={15} />{duration(h.uptime)}</span>
          <span className="fg-stat-name">
            {h.version ?? t('frigate.uptime')}
            {updatable ? ` → ${h.latestVersion}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}

// ---------- fullscreen camera / event view ----------
export type FocusTarget =
  | { camera: string; mode: 'live' | 'recap' }
  | { camera: string; mode: 'event'; eventId: string }

interface FocusProps {
  target: FocusTarget
  state: FrigateState
  onClose: () => void
  onTarget: (t: FocusTarget) => void
}

const RECAP_MINUTES = 30

export function CameraFocus({ target, state, onClose, onTarget }: FocusProps) {
  const { t, locale } = useStore()
  const camera = state.cameras.find((c) => c.name === target.camera)
  const events = useMemo(
    () => state.objects.filter((o) => o.camera === target.camera).slice(0, 12),
    [state.objects, target.camera],
  )
  const [videoFailed, setVideoFailed] = useState(false)
  const eventId = target.mode === 'event' ? target.eventId : undefined
  // preview.mp4 is rendered on demand for a fixed window — pin it once so the
  // range doesn't slide out from under a clip that's already playing
  const [recap, setRecap] = useState<{ start: number; end: number } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    setVideoFailed(false)
    if (target.mode !== 'recap') return
    const end = Math.floor(Date.now() / 1000)
    setRecap({ start: end - RECAP_MINUTES * 60, end })
  }, [target.mode, target.camera, eventId])

  const health = state.health?.cameras[target.camera]
  const event = eventId ? state.objects.find((o) => o.id === eventId) : undefined
  const set = (mode: 'live' | 'recap') => onTarget({ camera: target.camera, mode })

  return (
    <div className="fg-modal" onClick={onClose}>
      <div className="fg-modal-box" onClick={(e) => e.stopPropagation()}>
        <header className="fg-modal-head">
          <h3>{camera?.label ?? target.camera}</h3>
          {health?.online === false && <span className="fg-badge off">{t('frigate.offline')}</span>}
          {health?.fps ? <span className="fg-badge live"><DotIcon size={10} />{health.fps} fps</span> : null}
          <div className="fg-modal-tabs">
            <button className={target.mode === 'live' ? 'active' : ''} onClick={() => set('live')}>
              <CameraIcon size={15} /> {t('frigate.live')}
            </button>
            <button className={target.mode === 'recap' ? 'active' : ''} onClick={() => set('recap')}>
              <FilmIcon size={15} /> {t('frigate.recap', { minutes: RECAP_MINUTES })}
            </button>
          </div>
          <button className="fg-modal-close" onClick={onClose} aria-label={t('frigate.close')}>
            <CloseIcon size={20} />
          </button>
        </header>

        <div className="fg-stage">
          {target.mode === 'live' && <img src={liveUrl(target.camera)} alt={camera?.label ?? ''} />}

          {target.mode === 'recap' && (videoFailed || !recap ? (
            <p className="fg-stage-msg">{t('frigate.noRecap')}</p>
          ) : (
            <video
              key={`${target.camera}-${recap.end}`}
              src={recapUrl(target.camera, recap.start, recap.end)}
              autoPlay loop muted controls playsInline
              onError={() => setVideoFailed(true)}
            />
          ))}

          {eventId && (videoFailed || !event?.hasClip ? (
            <img src={eventSnapshotUrl(eventId)} alt="" />
          ) : (
            <video
              key={eventId}
              src={eventClipUrl(eventId)}
              autoPlay loop controls playsInline
              onError={() => setVideoFailed(true)}
            />
          ))}
        </div>

        {event && (
          <p className="fg-event-meta">
            <b>{labelName(t, event.label)}</b>
            {event.subLabel ? ` · ${event.subLabel}` : ''}
            {event.score != null ? ` · ${Math.round(event.score * 100)}%` : ''}
            {event.zones.length ? ` · ${event.zones.join(', ')}` : ''}
            {event.plate ? ` · ${event.plate}` : ''}
            {event.speed ? ` · ${event.speed} km/h` : ''}
            {' · '}{clockTime(event.start, locale)}
          </p>
        )}

        {events.length > 0 && (
          <div className="fg-strip">
            {events.map((o) => (
              <button
                key={o.id}
                className={`fg-strip-item${target.mode === 'event' && target.eventId === o.id ? ' active' : ''}`}
                onClick={() => onTarget({ camera: target.camera, mode: 'event', eventId: o.id })}
              >
                <img src={eventThumbUrl(o.id)} alt="" loading="lazy" />
                <span>{labelName(t, o.label)}</span>
                <small>{clockTime(o.start, locale)}</small>
                {o.hasClip && <i className="fg-strip-play"><PlayIcon size={12} /></i>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- compact card for the smart-home page ----------
export function FrigateMini({ state, max = 4 }: { state: FrigateState; max?: number }) {
  const { t } = useStore()
  const unread = state.alerts.filter((a) => !a.reviewed && a.severity === 'alert').length
  const cams = state.cameras.slice(0, max)
  const latestFor = (name: string) => state.objects.find((o) => o.camera === name)

  return (
    <section className="card sh-cameras">
      <h2 className="card-title">
        {t('home.cameras')}
        <a className="fg-more" href="#/cameras">
          {unread > 0 && <em className="fg-badge alert"><AlertIcon size={12} />{unread}</em>}
          {t('frigate.viewAll')}
        </a>
      </h2>
      <div className="fg-wall compact">
        {cams.map((c) => (
          <CameraTile
            key={c.name}
            camera={c}
            health={state.health?.cameras[c.name]}
            alerts={state.alerts.filter((a) => a.camera === c.name && !a.reviewed && a.severity === 'alert')}
            latest={latestFor(c.name)}
            refreshSeconds={10}
            showActivity={false}
            onOpen={() => { location.hash = '/cameras' }}
          />
        ))}
      </div>
    </section>
  )
}

/** Shared "nothing to show" panel for both the page and the home-page card. */
export function FrigateEmpty({ error }: { error?: string | null }) {
  const { t } = useStore()
  return (
    <section className="card fg-empty">
      <span className="fg-empty-icon"><MotionIcon size={26} /></span>
      <h3>{t('frigate.notConfigured')}</h3>
      <p>{error ?? t('frigate.notConfiguredHint')}</p>
      <code>FRIGATE_URL=http://frigate.local:5000</code>
    </section>
  )
}
