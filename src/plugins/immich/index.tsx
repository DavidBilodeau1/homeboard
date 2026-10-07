import type { Plugin } from '../types'
import en from './en.json'
import fr from './fr.json'
import { ImmichSettingsPanel, type ImmichSettings } from './Settings'

/** Feeds the core slideshow from the server side; the client only holds its settings. */
export const immichPlugin: Plugin<ImmichSettings> = {
  id: 'immich',
  titleKey: 'immich.plugin.title',
  descriptionKey: 'immich.plugin.description',
  setupKey: 'immich.plugin.setup',
  messages: { en, fr },
  Settings: ImmichSettingsPanel,
}
