import { useEntityState, useStore } from '../../store'
import type { PluginSettings } from '../../types'
import { usePluginSettings } from '../settings'

export interface AirQualitySettings extends PluginSettings {
  /** an air quality index sensor */
  entity?: string
  name?: string
  /** highest index still considered safe */
  safeMax?: number
}

export const DEFAULT_SAFE_MAX = 50

const SAFE_COLOR = '#3d9b63'
/** Escalating colors for the index bands above the safe threshold. */
const UNSAFE_BANDS: [upTo: number, color: string][] = [
  [100, '#e0913c'],
  [150, '#e0673c'],
  [200, '#d64545'],
  [300, '#8f3f97'],
  [Infinity, '#7e2323'],
]

export const aqiColor = (value: number, safeMax: number): string =>
  value <= safeMax ? SAFE_COLOR : UNSAFE_BANDS.find(([upTo]) => value <= upTo)![1]

export interface AirQuality {
  name: string
  value: number | null
  safe: boolean
  color: string
}

export function useAirQuality(): AirQuality | null {
  const { t } = useStore()
  const { entity, name, safeMax = DEFAULT_SAFE_MAX } = usePluginSettings<AirQualitySettings>('airQuality')
  const state = useEntityState(entity)
  if (!entity) return null
  const reading = Number(state?.state)
  const value = state && Number.isFinite(reading) ? reading : null
  return {
    name: name || t('air.title'),
    value,
    safe: value == null || value <= safeMax,
    color: value == null ? 'var(--muted)' : aqiColor(value, safeMax),
  }
}
