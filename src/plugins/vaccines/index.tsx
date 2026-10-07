import type { Plugin } from '../types'
import { CampaignAlert } from './CampaignAlert'
import en from './en.json'
import fr from './fr.json'
import type { VaccineSettings } from './types'
import { VaccineSettingsPanel } from './Settings'
import './vaccines.css'

export const vaccinesPlugin: Plugin<VaccineSettings> = {
  id: 'vaccines',
  titleKey: 'vaccines.plugin.title',
  descriptionKey: 'vaccines.plugin.description',
  messages: { en, fr },
  TopBarItem: CampaignAlert,
  Settings: VaccineSettingsPanel,
}
