import type { Plugin } from '../types'
import type { GarbageSettings } from './collections'
import en from './en.json'
import fr from './fr.json'
import { GarbageBadges } from './GarbageBadges'
import { GarbageLegend } from './GarbageLegend'
import { GarbageProvider } from './GarbageProvider'
import { GarbageSettingsPanel } from './Settings'
import './garbage.css'

export const garbagePlugin: Plugin<GarbageSettings> = {
  id: 'garbage',
  titleKey: 'garbage.plugin.title',
  descriptionKey: 'garbage.plugin.description',
  messages: { en, fr },
  Provider: GarbageProvider,
  TopBarItem: GarbageBadges,
  calendar: { Legend: GarbageLegend },
  Settings: GarbageSettingsPanel,
}
