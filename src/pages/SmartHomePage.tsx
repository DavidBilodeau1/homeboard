import React, { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { useStore } from '../store'
import { getCameraStream } from '../api'
import type { NamedEntity } from '../types'
import { BulbIcon, LockIcon, ShieldIcon, CameraIcon, ThermoIcon, PoolIcon, AirIcon, SunIcon } from '../icons'

const num = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Two-tap confirmation: first tap arms for 3 s, second tap fires. */
function useConfirm() {
  const [armed, setArmed] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])
  return (key: string, fn: () => void) => {
    if (armed === key) {
      clearTimeout(timer.current)
      setArmed(null)
      fn()
    } else {
      clearTimeout(timer.current)
      setArmed(key)
      timer.current = setTimeout(() => setArmed(null), 3000)
    }
  }
}

function ClimateCard({ entity }: { entity: string }) {
  const { entityStates, callService, t } = useStore()
  const st = entityStates[entity]
  if (!st) return <section className="card sh-climate"><h2 className="card-title">{t('home.climate')}</h2><div className="cal-empty">{t('state.unavailable')}</div></section>

  const current = num(st.attributes.current_temperature)
  const target = num(st.attributes.temperature)
  const modes = (st.attributes.hvac_modes as string[] | undefined) ?? []
  const action = String(st.attributes.hvac_action ?? '')
  const mode = st.state
  const setTarget = (delta: number) => {
    if (target == null) return
    callService('climate', 'set_temperature', { entity_id: entity, temperature: Math.round((target + delta) * 2) / 2 })
  }

  return (
    <section className={`card sh-climate mode-${mode} action-${action}`}>
      <h2 className="card-title">{t('home.climate')}</h2>
      <div className="sh-climate-body">
        <div className="sh-climate-current">
          <span className="sh-climate-temp">{current != null ? current.toFixed(1) : '--'}<em>°</em></span>
          <span className="sh-climate-action">{action ? t(`action.${action}`) : ''}</span>
        </div>
        <div className="sh-climate-target">
          <button onClick={() => setTarget(-0.5)} aria-label="−0.5°">−</button>
          <span>
            <b>{target != null ? target.toFixed(1) : '--'}°</b>
            <small>{t('home.target')}</small>
          </span>
          <button onClick={() => setTarget(0.5)} aria-label="+0.5°">+</button>
        </div>
      </div>
      <div className="sh-modes">
        {modes.map((m) => (
          <button
            key={m}
            className={`sh-mode${m === mode ? ' active' : ''} sh-mode-${m}`}
            onClick={() => callService('climate', 'set_hvac_mode', { entity_id: entity, hvac_mode: m })}
          >
            {t(`hvac.${m}`)}
          </button>
        ))}
      </div>
    </section>
  )
}

/** Live HLS video for one camera. Mints a proxied playlist URL from the
 *  server, plays via hls.js (native HLS on Safari), and retries on stall. */
function CameraStream({ entity, muted = true }: { entity: string; muted?: boolean }) {
  const { t } = useStore()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let hls: Hls | null = null
    let retry: ReturnType<typeof setTimeout>
    const video = videoRef.current

    const start = async () => {
      if (cancelled || !video) return
      try {
        const { url } = await getCameraStream(entity)
        if (cancelled) return
        setFailed(false)
        if (hls) { hls.destroy(); hls = null }
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari / native HLS
          video.src = url
          video.play().catch(() => {})
        } else if (Hls.isSupported()) {
          hls = new Hls({ liveDurationInfinity: true, backBufferLength: 10 })
          hls.loadSource(url)
          hls.attachMedia(video)
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal && !cancelled) {
              hls?.destroy()
              hls = null
              retry = setTimeout(start, 4000) // stream idled out / dropped → re-mint
            }
          })
        } else {
          setFailed(true)
        }
      } catch {
        if (!cancelled) {
          setFailed(true)
          retry = setTimeout(start, 6000)
        }
      }
    }
    start()

    return () => {
      cancelled = true
      clearTimeout(retry)
      hls?.destroy()
    }
  }, [entity])

  return (
    <>
      <video ref={videoRef} autoPlay playsInline muted={muted} style={failed ? { visibility: 'hidden' } : undefined} />
      {failed && (
        <span className="sh-camera-off">
          <CameraIcon size={30} />
          {t('state.unavailable')}
        </span>
      )}
    </>
  )
}

function CameraCard({ cameras }: { cameras: NamedEntity[] }) {
  const { t } = useStore()
  const [zoomed, setZoomed] = useState<NamedEntity | null>(null)

  return (
    <section className="card sh-cameras">
      <h2 className="card-title">{t('home.cameras')}</h2>
      <div className="sh-camera-grid">
        {cameras.map((c) => (
          <button key={c.entity} className="sh-camera" onClick={() => setZoomed(c)}>
            <CameraStream entity={c.entity} />
            <span><CameraIcon size={14} /> {c.name}</span>
          </button>
        ))}
      </div>
      {zoomed && (
        <div className="sh-camera-overlay" onClick={() => setZoomed(null)}>
          <CameraStream entity={zoomed.zoomEntity ?? zoomed.entity} muted />
          <span>{zoomed.name}</span>
        </div>
      )}
    </section>
  )
}

const SENSOR_ICONS: Record<string, React.ReactNode> = {
  pool: <PoolIcon />,
  air: <AirIcon />,
  sun: <SunIcon size={20} />,
  temp: <ThermoIcon />,
}

function SensorsCard({ sensors }: { sensors: NamedEntity[] }) {
  const { entityStates, t } = useStore()
  return (
    <section className="card sh-sensors">
      <h2 className="card-title">{t('home.sensors')}</h2>
      <div className="sh-tile-grid">
        {sensors.map((s) => {
          const st = entityStates[s.entity]
          const v = num(st?.state)
          const unit = String(st?.attributes?.unit_of_measurement ?? '')
          return (
            <div className="sh-tile" key={s.entity}>
              <span className="sh-tile-icon">{SENSOR_ICONS[s.icon ?? ''] ?? <ThermoIcon />}</span>
              <span className="sh-tile-value">{v != null ? `${Math.round(v * 10) / 10}${unit}` : '–'}</span>
              <span className="sh-tile-name">{s.name}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function LightsCard({ lights }: { lights: NamedEntity[] }) {
  const { entityStates, callService, t } = useStore()
  return (
    <section className="card sh-lights">
      <h2 className="card-title">{t('home.lights')}</h2>
      <div className="sh-tile-grid">
        {lights.map((l) => {
          const st = entityStates[l.entity]
          const on = st?.state === 'on'
          return (
            <button
              key={l.entity}
              className={`sh-tile sh-light${on ? ' on' : ''}`}
              disabled={!st}
              onClick={() => callService('light', on ? 'turn_off' : 'turn_on', { entity_id: l.entity })}
            >
              <span className="sh-tile-icon"><BulbIcon /></span>
              <span className="sh-tile-value">{st ? t(on ? 'light.on' : 'light.off') : '–'}</span>
              <span className="sh-tile-name">{l.name}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function SecurityCard({ locks, alarm }: { locks: NamedEntity[]; alarm?: string }) {
  const { entityStates, callService, t } = useStore()
  const confirm = useConfirm()
  const [pending, setPending] = useState<string | null>(null)

  const alarmSt = alarm ? entityStates[alarm] : null
  const alarmArmed = alarmSt != null && alarmSt.state !== 'disarmed'

  return (
    <section className="card sh-security">
      <h2 className="card-title">{t('home.security')}</h2>
      <div className="sh-tile-grid">
        {locks.map((l) => {
          const st = entityStates[l.entity]
          const locked = st?.state === 'locked'
          const key = `lock:${l.entity}`
          return (
            <button
              key={l.entity}
              className={`sh-tile sh-lock${locked ? ' locked' : ' unlocked'}${pending === key ? ' pending' : ''}`}
              disabled={!st}
              onClick={() => { setPending(key); confirm(key, () => { setPending(null); callService('lock', locked ? 'unlock' : 'lock', { entity_id: l.entity }) }) }}
            >
              <span className="sh-tile-icon"><LockIcon open={!locked} /></span>
              <span className="sh-tile-value">
                {pending === key ? t('home.confirm') : st ? t(locked ? 'lock.locked' : 'lock.unlocked') : '–'}
              </span>
              <span className="sh-tile-name">{l.name}</span>
            </button>
          )
        })}
        {alarm && (
          <button
            className={`sh-tile sh-alarm state-${alarmSt?.state ?? 'unknown'}${pending === 'alarm' ? ' pending' : ''}`}
            disabled={!alarmSt}
            onClick={() => {
              setPending('alarm')
              confirm('alarm', () => {
                setPending(null)
                callService('alarm_control_panel', alarmArmed ? 'alarm_disarm' : 'alarm_arm_home', { entity_id: alarm })
              })
            }}
          >
            <span className="sh-tile-icon"><ShieldIcon /></span>
            <span className="sh-tile-value">
              {pending === 'alarm' ? t('home.confirm') : alarmSt ? t(`alarm.${alarmSt.state}`) : '–'}
            </span>
            <span className="sh-tile-name">{alarmArmed ? t('alarm.disarm') : t('alarm.arm')}</span>
          </button>
        )}
      </div>
    </section>
  )
}

export function SmartHomePage() {
  const { config, t } = useStore()
  const sh = config?.smartHome
  if (!sh || (!sh.climate && !sh.cameras?.length && !sh.sensors?.length && !sh.lights?.length && !sh.locks?.length && !sh.alarm)) {
    return <div className="card page-card"><p className="cal-empty">{t('home.notConfigured')}</p></div>
  }

  return (
    <div className="sh-grid">
      {sh.climate && <ClimateCard entity={sh.climate} />}
      {!!sh.cameras?.length && <CameraCard cameras={sh.cameras} />}
      {!!sh.sensors?.length && <SensorsCard sensors={sh.sensors} />}
      {!!sh.lights?.length && <LightsCard lights={sh.lights} />}
      {(!!sh.locks?.length || sh.alarm) && <SecurityCard locks={sh.locks ?? []} alarm={sh.alarm} />}
    </div>
  )
}
