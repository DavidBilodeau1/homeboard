import React, { useEffect, useMemo, useState } from 'react'
import { CameraIcon, CloseIcon, DotIcon, FilmIcon, PlayIcon } from '../../icons'
import { useStore } from '../../store'
import {
  clockTime, eventClipUrl, eventSnapshotUrl, eventThumbUrl, liveUrl, recapUrl,
  type FrigateObject, type FrigateState,
} from './api'
import { labelName } from './labels'

const RECAP_MINUTES = 30
const STRIP_EVENTS = 12

export type FocusTarget =
  | { camera: string; mode: 'live' | 'recap' }
  | { camera: string; mode: 'event'; eventId: string }

interface Props {
  target: FocusTarget
  state: FrigateState
  onClose: () => void
  onTarget: (target: FocusTarget) => void
}

function useEscape(onEscape: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onEscape() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onEscape])
}

function EventMeta({ event }: { event: FrigateObject }) {
  const { t, locale } = useStore()
  const details = [
    event.subLabel,
    event.score != null && `${Math.round(event.score * 100)}%`,
    event.zones.join(', '),
    event.plate,
    event.speed && `${event.speed} km/h`,
    clockTime(event.start, locale),
  ].filter(Boolean)
  return <p className="fg-event-meta"><b>{labelName(t, event.label)}</b>{details.map((d) => ` · ${d}`).join('')}</p>
}

/** Fullscreen view of one camera: live feed, a recent timelapse, or one event's clip. */
export function CameraFocus({ target, state, onClose, onTarget }: Props) {
  const { t, locale } = useStore()
  const camera = state.cameras.find((c) => c.name === target.camera)
  const events = useMemo(
    () => state.objects.filter((o) => o.camera === target.camera).slice(0, STRIP_EVENTS),
    [state.objects, target.camera],
  )
  const [videoFailed, setVideoFailed] = useState(false)
  const eventId = target.mode === 'event' ? target.eventId : undefined
  // preview.mp4 renders a fixed window: pin it so a playing clip keeps its range
  const [recap, setRecap] = useState<{ start: number; end: number } | null>(null)
  useEscape(onClose)

  useEffect(() => {
    setVideoFailed(false)
    if (target.mode !== 'recap') return
    const end = Math.floor(Date.now() / 1000)
    setRecap({ start: end - RECAP_MINUTES * 60, end })
  }, [target.mode, target.camera, eventId])

  const health = state.health?.cameras[target.camera]
  const event = eventId ? state.objects.find((o) => o.id === eventId) : undefined
  const show = (mode: 'live' | 'recap') => onTarget({ camera: target.camera, mode })

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>{camera?.label ?? target.camera}</h3>
          {health?.online === false && <span className="fg-badge off">{t('frigate.offline')}</span>}
          {!!health?.fps && <span className="fg-badge live"><DotIcon size={10} />{health.fps} fps</span>}
          <div className="fg-modal-tabs">
            <button className={target.mode === 'live' ? 'active' : ''} onClick={() => show('live')}>
              <CameraIcon size={15} /> {t('frigate.live')}
            </button>
            <button className={target.mode === 'recap' ? 'active' : ''} onClick={() => show('recap')}>
              <FilmIcon size={15} /> {t('frigate.recap', { minutes: RECAP_MINUTES })}
            </button>
          </div>
          <button className="modal-close" onClick={onClose} aria-label={t('modal.close')}>
            <CloseIcon size={20} />
          </button>
        </header>

        <div className="fg-stage">
          {target.mode === 'live' && <img src={liveUrl(target.camera)} alt={camera?.label ?? ''} />}

          {target.mode === 'recap' && (videoFailed || !recap ? (
            <p className="fg-stage-msg">{t('frigate.noRecap')}</p>
          ) : (
            <video key={`${target.camera}-${recap.end}`} src={recapUrl(target.camera, recap.start, recap.end)}
              autoPlay loop muted controls playsInline onError={() => setVideoFailed(true)} />
          ))}

          {eventId && (videoFailed || !event?.hasClip ? (
            <img src={eventSnapshotUrl(eventId)} alt="" />
          ) : (
            <video key={eventId} src={eventClipUrl(eventId)} autoPlay loop controls playsInline onError={() => setVideoFailed(true)} />
          ))}
        </div>

        {event && <EventMeta event={event} />}

        {events.length > 0 && (
          <div className="fg-strip">
            {events.map((o) => (
              <button
                key={o.id}
                className={`fg-strip-item${eventId === o.id ? ' active' : ''}`}
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
