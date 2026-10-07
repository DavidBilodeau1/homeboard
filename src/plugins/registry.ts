import { airQualityPlugin } from './airQuality'
import { expensavePlugin } from './expensave'
import { floorPlanPlugin } from './floorPlan'
import { frigatePlugin } from './frigate'
import { garbagePlugin } from './garbage'
import { hockeyPlugin } from './hockey'
import { immichPlugin } from './immich'
import type { AnyPlugin } from './types'

export const PLUGINS: AnyPlugin[] = [
  frigatePlugin,
  floorPlanPlugin,
  expensavePlugin,
  immichPlugin,
  hockeyPlugin,
  garbagePlugin,
  airQualityPlugin,
]

export const PLUGIN_MESSAGES = PLUGINS.map((plugin) => plugin.messages)
