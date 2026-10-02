import type { Plugin } from '../types'
import en from './en.json'
import fr from './fr.json'
import { HockeyTile } from './HockeyTile'
import { HockeySettingsPanel } from './Settings'
import type { HockeySettings } from './types'
import './hockey.css'

export const hockeyPlugin: Plugin<HockeySettings> = {
  id: 'hockey',
  titleKey: 'hockey.plugin.title',
  descriptionKey: 'hockey.plugin.description',
  messages: { en, fr },
  tiles: [{ id: 'hockey', titleKey: 'hockey.title', size: { w: 4, h: 4 }, Component: HockeyTile }],
  Settings: HockeySettingsPanel,
}
