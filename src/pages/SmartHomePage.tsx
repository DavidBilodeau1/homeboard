import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { useFrigate } from '../frigate'
import { FrigateMini } from '../components/FrigateTiles'
import type { NamedEntity } from '../types'
import { BulbIcon, LockIcon, ShieldIcon, ThermoIcon, PoolIcon, AirIcon, SunIcon, MusicIcon, PlayIcon, PauseIcon, PrevTrackIcon, NextTrackIcon, SpeakerIcon } from '../icons'

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

function MediaCard({ players }: { players: NamedEntity[] }) {
  const { entityStates, callService, t } = useStore()
  // volume being dragged, per player — shown immediately, committed on release
  const [dragVol, setDragVol] = useState<Record<string, number>>({})

  const commitVol = async (entity: string) => {
    const v = dragVol[entity]
    if (v == null) return
    await callService('media_player', 'volume_set', { entity_id: entity, volume_level: v / 100 })
    setDragVol((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== entity)))
  }

  return (
    <section className="card sh-media">
      <h2 className="card-title">{t('home.media')}</h2>
      <div className="sh-media-rows">
        {players.map((p) => {
          const st = entityStates[p.entity]
          const off = !st || st.state === 'off' || st.state === 'unavailable'
          const playing = st?.state === 'playing'
          const title = [st?.attributes?.media_title, st?.attributes?.media_artist]
            .filter(Boolean).join(' — ')
          const volRaw = num(st?.attributes?.volume_level)
          const vol = dragVol[p.entity] ?? (volRaw != null ? Math.round(volRaw * 100) : null)
          return (
            <div className={`sh-media-row${playing ? ' playing' : ''}`} key={p.entity}>
              <span className="sh-media-icon"><MusicIcon /></span>
              <span className="sh-media-info">
                <b>{p.name}</b>
                <small>{off ? t('state.unavailable') : title || t('media.nothing')}</small>
              </span>
              <span className="sh-media-controls">
                <button aria-label={t('media.previous')} disabled={off}
                  onClick={() => callService('media_player', 'media_previous_track', { entity_id: p.entity })}>
                  <PrevTrackIcon size={18} />
                </button>
                <button className="sh-media-play" aria-label={t('media.playPause')} disabled={off}
                  onClick={() => callService('media_player', 'media_play_pause', { entity_id: p.entity })}>
                  {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
                </button>
                <button aria-label={t('media.next')} disabled={off}
                  onClick={() => callService('media_player', 'media_next_track', { entity_id: p.entity })}>
                  <NextTrackIcon size={18} />
                </button>
              </span>
              {vol != null && (
                <span className="sh-media-volume">
                  <SpeakerIcon size={17} />
                  <input
                    type="range" min={0} max={100} value={vol} disabled={off}
                    aria-label={t('media.volume')}
                    onChange={(e) => setDragVol((d) => ({ ...d, [p.entity]: Number(e.target.value) }))}
                    onPointerUp={() => commitVol(p.entity)}
                    onKeyUp={() => commitVol(p.entity)}
                  />
                </span>
              )}
            </div>
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
  // one slow poll here — the wall of snapshots lives on the Cameras page
  const { state: frigate } = useFrigate(30_000)
  const hasCameras = !!frigate?.enabled && frigate.cameras.length > 0
  if (!sh || (!sh.climate && !hasCameras && !sh.sensors?.length && !sh.lights?.length && !sh.locks?.length && !sh.mediaPlayers?.length && !sh.alarm)) {
    return <div className="card page-card"><p className="cal-empty">{t('home.notConfigured')}</p></div>
  }

  return (
    <div className="sh-grid">
      {sh.climate && <ClimateCard entity={sh.climate} />}
      {hasCameras && frigate && <FrigateMini state={frigate} />}
      {!!sh.sensors?.length && <SensorsCard sensors={sh.sensors} />}
      {!!sh.lights?.length && <LightsCard lights={sh.lights} />}
      {!!sh.mediaPlayers?.length && <MediaCard players={sh.mediaPlayers} />}
      {(!!sh.locks?.length || sh.alarm) && <SecurityCard locks={sh.locks ?? []} alarm={sh.alarm} />}
    </div>
  )
}
