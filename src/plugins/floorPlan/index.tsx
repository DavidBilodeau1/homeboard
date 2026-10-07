import React from 'react'
import { FloorPlanIcon } from '../../icons'
import type { Plugin } from '../types'
import en from './en.json'
import { FloorPlanPage } from './FloorPlanPage'
import fr from './fr.json'
import type { FloorPlanSettings } from './types'
import './floorPlan.css'

export const floorPlanPlugin: Plugin<FloorPlanSettings> = {
  id: 'floorPlan',
  titleKey: 'floorplan.plugin.title',
  descriptionKey: 'floorplan.plugin.description',
  messages: { en, fr },
  pages: [{ id: 'floorplan', titleKey: 'nav.floorplan', icon: <FloorPlanIcon />, Component: FloorPlanPage, after: 'home' }],
}
