import React from 'react'
import { MoneyIcon } from '../../icons'
import type { Plugin } from '../types'
import { MoneyDayBadge, MoneyDayDetails, MoneyLegend } from './CalendarLayer'
import en from './en.json'
import fr from './fr.json'
import { MoneyPage } from './MoneyPage'
import { MoneyProvider } from './MoneyProvider'
import { MoneyTile } from './MoneyTile'
import { ExpensaveSettingsPanel } from './Settings'
import type { ExpensaveSettings } from './types'
import './expensave.css'

export const expensavePlugin: Plugin<ExpensaveSettings> = {
  id: 'expensave',
  titleKey: 'money.plugin.title',
  descriptionKey: 'money.plugin.description',
  setupKey: 'money.plugin.setup',
  messages: { en, fr },
  Provider: MoneyProvider,
  pages: [{ id: 'money', titleKey: 'nav.money', icon: <MoneyIcon />, Component: MoneyPage, after: 'calendar' }],
  tiles: [{ id: 'money', titleKey: 'nav.money', size: { w: 3, h: 4 }, Component: MoneyTile }],
  calendar: { Legend: MoneyLegend, DayBadge: MoneyDayBadge, DayDetails: MoneyDayDetails },
  Settings: ExpensaveSettingsPanel,
}
