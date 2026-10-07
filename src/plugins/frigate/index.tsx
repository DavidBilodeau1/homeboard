import React from 'react'
import { CameraIcon } from '../../icons'
import type { Plugin } from '../types'
import { CamerasCard } from './CamerasCard'
import { CamerasPage } from './CamerasPage'
import en from './en.json'
import fr from './fr.json'
import { FrigateSettingsPanel } from './Settings'
import type { FrigateSettings } from './types'
import './frigate.css'

export const frigatePlugin: Plugin<FrigateSettings> = {
  id: 'frigate',
  titleKey: 'frigate.plugin.title',
  descriptionKey: 'frigate.plugin.description',
  setupKey: 'frigate.plugin.setup',
  messages: { en, fr },
  pages: [{ id: 'cameras', titleKey: 'nav.cameras', icon: <CameraIcon size={22} />, Component: CamerasPage, after: 'home' }],
  homeCards: [CamerasCard],
  Settings: FrigateSettingsPanel,
}
