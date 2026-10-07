import React, { useMemo, useState } from 'react'
import { CheckIcon } from '../../icons'
import { useStore } from '../../store'
import { clockTime, eventThumbUrl, reviewPreviewUrl, timeAgo, type FrigateAlert, type FrigateState } from './api'
import { labelName } from './labels'

interface RowProps {
  alert: FrigateAlert
  cameraLabel: string
  onOpen: () => void
  onReview: () => void
}

function AlertRow({ alert, cameraLabel, onOpen, onReview }: RowProps) {
  const { t, locale } = useStore()
  const still = alert.detections[0] ? eventThumbUrl(alert.detections[0]) : reviewPreviewUrl(alert.id)
  // hovering (or focusing, on a touch panel) plays the animated preview
  const [animate, setAnimate] = useState(false)
  const [previewFailed, setPreviewFailed] = useState(false)
  const src = animate && !previewFailed ? reviewPreviewUrl(alert.id) : still
  const objects = alert.objects.length ? alert.objects : alert.audio

  return (
    <li
      className={`fg-alert${alert.reviewed ? ' seen' : ''} sev-${alert.severity}`}
      onMouseEnter={() => setAnimate(true)}
      onMouseLeave={() => setAnimate(false)}
    >
      <button className="fg-alert-main" onClick={onOpen}>
        <span className="fg-alert-thumb">
          <img src={src} alt="" loading="lazy" onError={() => setPreviewFailed(true)} />
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
          <small className="fg-alert-when">{clockTime(alert.start, locale)} · {timeAgo(alert.start, locale)}</small>
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

interface Props {
  state: FrigateState
  onOpen: (alert: FrigateAlert) => void
  onReview: (ids: string[]) => void
}

export function AlertsFeed({ state, onOpen, onReview }: Props) {
  const { t } = useStore()
  const labels = useMemo(() => new Map(state.cameras.map((c) => [c.name, c.label])), [state.cameras])
  const unread = state.alerts.filter((a) => !a.reviewed)

  return (
    <section className="card fg-feed">
      <h2 className="card-title">
        {t('frigate.alerts')}
        {unread.length > 0 && (
          <button className="fg-ackall" onClick={() => onReview(unread.map((a) => a.id))}>
            <CheckIcon size={14} /> {t('frigate.markAllReviewed')}
          </button>
        )}
      </h2>
      {state.alerts.length === 0 ? (
        <p className="cal-empty">{t('frigate.noAlerts')}</p>
      ) : (
        <ul className="fg-alerts">
          {state.alerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              cameraLabel={labels.get(alert.camera) ?? alert.camera}
              onOpen={() => onOpen(alert)}
              onReview={() => onReview([alert.id])}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
