import type { PluginSettings } from '../../types'

export interface VaccineSettings extends PluginSettings {
  /** season whose alert was dismissed, e.g. "2026-2027" */
  dismissedSeason?: string
}

export interface SourceResult {
  state: 'open' | 'closed' | 'missing' | 'error'
  /** Clic Santé flag looked up this season */
  flag?: string
  error?: string
}

export interface CampaignStatus {
  season: string
  open: boolean
  /** sources that have kept failing for a day */
  failing: string[]
  sources: Record<string, SourceResult>
  checkedAt: string
}
