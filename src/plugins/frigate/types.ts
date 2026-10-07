import type { PluginSettings } from '../../types'

/** Cameras come from Frigate itself; these only pick, order and pace them. */
export interface FrigateSettings extends PluginSettings {
  /** camera names in display order; empty shows every enabled camera */
  cameras?: string[]
  /** snapshot refresh on the camera wall, in seconds */
  refreshSeconds?: number
  /** alert, detection and health polling, in seconds */
  pollSeconds?: number
  alertLimit?: number
}

export const DEFAULTS = { refreshSeconds: 8, pollSeconds: 15, alertLimit: 20 }
