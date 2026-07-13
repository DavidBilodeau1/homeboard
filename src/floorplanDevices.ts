// Maps a Home Assistant entity to how it behaves on the floor plan: what icon
// it shows, whether it reads as "on", what a tap does, and what value to label
// it with. Kept separate from the page so the mapping is easy to extend.

import type { EntityState } from './types'

export type { FloorDevice } from './types'

export type DeviceKind = 'toggle' | 'lock' | 'cover' | 'alarm' | 'trigger' | 'climate' | 'sensor' | 'view'

export const domainOf = (entity: string) => entity.split('.')[0]

const TOGGLE = new Set(['light', 'switch', 'fan', 'input_boolean', 'humidifier', 'siren', 'media_player'])
const TRIGGER = new Set(['scene', 'script', 'button', 'input_button', 'automation'])

export const deviceKind = (entity: string): DeviceKind => {
  const d = domainOf(entity)
  if (d === 'lock') return 'lock'
  if (d === 'cover') return 'cover'
  if (d === 'alarm_control_panel') return 'alarm'
  if (d === 'climate') return 'climate'
  if (TRIGGER.has(d)) return 'trigger'
  if (TOGGLE.has(d)) return 'toggle'
  if (['sensor', 'binary_sensor', 'number', 'input_number', 'device_tracker', 'person'].includes(d)) return 'sensor'
  return 'view'
}

export const isActionable = (kind: DeviceKind) =>
  kind === 'toggle' || kind === 'lock' || kind === 'cover' || kind === 'alarm' || kind === 'trigger'

/** dangerous actions get a two-tap confirm */
export const needsConfirm = (kind: DeviceKind) => kind === 'lock' || kind === 'alarm'

/** whether the entity reads as active/on — drives the marker's highlight */
export const isOn = (entity: string, st: EntityState | null | undefined): boolean => {
  if (!st) return false
  const d = domainOf(entity)
  if (d === 'lock') return st.state === 'locked'
  if (d === 'alarm_control_panel') return st.state !== 'disarmed' && st.state !== 'unavailable'
  if (d === 'binary_sensor') return st.state === 'on'
  return ['on', 'open', 'home', 'playing', 'heat', 'cool', 'heat_cool', 'auto', 'cleaning']
    .includes(st.state) || st.state.startsWith('armed')
}

interface Call { domain: string; service: string; data: Record<string, unknown> }

/** The service to call for a tap given the current state, or null for view-only. */
export const tapService = (entity: string, st: EntityState | null | undefined): Call | null => {
  const d = domainOf(entity)
  const data = { entity_id: entity }
  switch (deviceKind(entity)) {
    case 'toggle':
      if (d === 'media_player') return { domain: 'media_player', service: 'media_play_pause', data }
      return { domain: d, service: 'toggle', data }
    case 'lock':
      return st?.state === 'locked'
        ? { domain: 'lock', service: 'unlock', data }
        : { domain: 'lock', service: 'lock', data }
    case 'cover':
      return st?.state === 'open'
        ? { domain: 'cover', service: 'close_cover', data }
        : { domain: 'cover', service: 'open_cover', data }
    case 'alarm':
      return st && st.state !== 'disarmed'
        ? { domain: 'alarm_control_panel', service: 'alarm_disarm', data }
        : { domain: 'alarm_control_panel', service: 'alarm_arm_home', data }
    case 'trigger':
      if (d === 'button' || d === 'input_button') return { domain: d, service: 'press', data }
      if (d === 'automation') return { domain: 'automation', service: 'trigger', data }
      return { domain: d, service: 'turn_on', data } // scene, script
    default:
      return null
  }
}

/** Short text shown under the marker (sensors, climate); null when state is
 *  conveyed by colour alone (lights, locks, binary sensors, …). */
export const deviceValue = (entity: string, st: EntityState | null | undefined): string | null => {
  if (!st) return null
  const d = domainOf(entity)
  if (d === 'climate') {
    const cur = Number(st.attributes?.current_temperature)
    return Number.isFinite(cur) ? `${Math.round(cur * 10) / 10}°` : null
  }
  if (d === 'sensor' || d === 'number' || d === 'input_number') {
    const n = Number(st.state)
    const unit = String(st.attributes?.unit_of_measurement ?? '')
    return Number.isFinite(n) ? `${Math.round(n * 10) / 10}${unit}` : st.state
  }
  return null
}
