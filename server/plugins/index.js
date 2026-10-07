import airQuality from './airQuality.js'
import expensave from './expensave/index.js'
import floorPlan from './floorPlan.js'
import frigate from './frigate/index.js'
import garbage from './garbage.js'
import hockey from './hockey.js'
import immich from './immich.js'

/**
 * Each plugin may have: `validate(settings)`, the env-configured external `service` it talks to,
 * a `router(context)` served at /api/plugins/<id> while enabled, and a slideshow `photoSource(context)`.
 */
export const PLUGINS = [frigate, expensave, immich, hockey, garbage, airQuality, floorPlan]

/** Whether the server can serve the plugin, and whether it does so with demo data. */
export function pluginStatus(plugin, mock) {
  const { service } = plugin
  if (!service || service.configured) return { available: true, mocked: false }
  const mocked = mock && service.mockable
  return { available: mocked, mocked }
}

export function describeService(plugin, mock) {
  const { service } = plugin
  if (service.configured) return `${service.name} @ ${service.url}`
  return `${service.name} ${pluginStatus(plugin, mock).mocked ? 'mocked (demo data)' : 'not configured'}`
}
