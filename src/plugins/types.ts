import type { ComponentType, ReactNode } from 'react'
import type { EntityOption } from '../components/editor/useEntityOptions'
import type { MessageBundle } from '../i18n'
import type { PluginSettings } from '../types'

export interface TileProps {
  /** the dashboard is being rearranged: tiles must not navigate or open links */
  editing: boolean
}

export interface TileDefinition {
  id: string
  titleKey: string
  size: { w: number; h: number }
  Component: ComponentType<TileProps>
}

export interface PageDefinition {
  id: string
  titleKey: string
  icon: ReactNode
  Component: ComponentType
  /** core page this one follows in the sidebar; plugin pages without one come last */
  after?: string
}

/** What a plugin adds to the calendar views, next to the HA calendars. */
export interface CalendarExtension {
  Legend?: ComponentType
  DayBadge?: ComponentType<{ day: string }>
  DayDetails?: ComponentType<{ day: string }>
}

export interface SettingsPanelProps<S extends PluginSettings> {
  settings: S
  onChange: (next: S) => void
  entities: EntityOption[]
}

/** The client half of an optional integration; it fills only the extension points it needs. */
export interface Plugin<S extends PluginSettings = PluginSettings> {
  /** matches the server plugin and the key under `config.plugins` */
  id: string
  titleKey: string
  descriptionKey: string
  /** what the server needs before the plugin can run (env vars) */
  setupKey?: string
  messages: MessageBundle
  /** always wraps the app, so toggling a plugin never remounts it; must stay idle while inactive */
  Provider?: ComponentType<{ active: boolean; children: ReactNode }>
  pages?: PageDefinition[]
  tiles?: TileDefinition[]
  homeCards?: ComponentType[]
  TopBarItem?: ComponentType
  calendar?: CalendarExtension
  Settings?: ComponentType<SettingsPanelProps<S>>
}

export type AnyPlugin = Plugin<any>
