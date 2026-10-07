import type { PluginSettings } from '../../types'

export interface HockeySettings extends PluginSettings {
  /** a sensor of the NHL API integration, e.g. sensor.nhl_mtl */
  entity?: string
  /** tracked team's tri-code; read from a `nhl_<team>` entity id when unset */
  team?: string
}
