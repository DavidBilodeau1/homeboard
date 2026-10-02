import type { Plugin } from '../types'
import { AirQualityBadge } from './AirQualityBadge'
import { AirQualityTile } from './AirQualityTile'
import en from './en.json'
import fr from './fr.json'
import { AirQualitySettingsPanel } from './Settings'
import type { AirQualitySettings } from './useAirQuality'
import './airQuality.css'

export const airQualityPlugin: Plugin<AirQualitySettings> = {
  id: 'airQuality',
  titleKey: 'air.plugin.title',
  descriptionKey: 'air.plugin.description',
  messages: { en, fr },
  tiles: [{ id: 'airQuality', titleKey: 'air.title', size: { w: 3, h: 4 }, Component: AirQualityTile }],
  TopBarItem: AirQualityBadge,
  Settings: AirQualitySettingsPanel,
}
