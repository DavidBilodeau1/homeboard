import { firstError, isNamedRows, isObject, isOptionalString } from './checks.js'
import { PLUGINS } from './plugins/index.js'

const LIST_SECTIONS = ['tasks', 'meals', 'lists', 'rewards']
const SMART_HOME_LISTS = ['sensors', 'lights', 'locks', 'mediaPlayers']

const isCalendarList = (v) => v === undefined || (Array.isArray(v) && v.every((row) => isObject(row) && typeof row.entity === 'string'))

const isTile = (tile) => isObject(tile) && typeof tile.id === 'string' && ['x', 'y', 'w', 'h'].every((key) => Number.isFinite(tile[key]))

function validateSmartHome(smartHome) {
  if (smartHome === undefined) return null
  if (!isObject(smartHome)) return 'smartHome must be an object'
  const bad = SMART_HOME_LISTS.find((key) => !isNamedRows(smartHome[key]))
  return bad ? `smartHome.${bad} must be an array of { name, entity }` : null
}

function validateDashboard(dashboard) {
  if (dashboard === undefined) return null
  if (!isObject(dashboard)) return 'dashboard must be an object'
  if (!Array.isArray(dashboard.tiles)) return 'dashboard.tiles must be an array'
  return dashboard.tiles.every(isTile) ? null : 'dashboard.tiles items must be { id, x, y, w, h }'
}

function validatePlugins(plugins) {
  if (plugins === undefined) return null
  if (!isObject(plugins)) return 'plugins must be an object'
  for (const plugin of PLUGINS) {
    const settings = plugins[plugin.id]
    if (settings === undefined) continue
    if (!isObject(settings)) return `plugins.${plugin.id} must be an object`
    if (settings.enabled !== undefined && typeof settings.enabled !== 'boolean') return `plugins.${plugin.id}.enabled must be true or false`
    const error = plugin.validate?.(settings)
    if (error) return `plugins.${plugin.id}: ${error}`
  }
  return null
}

/** Validation for PUT /api/config. Unknown keys are ignored so the schema can grow. */
export function validateConfig(config) {
  if (!isObject(config)) return 'config must be a JSON object'
  const badList = LIST_SECTIONS.find((key) => !isNamedRows(config[key]))
  return firstError([
    [isOptionalString(config.weatherEntity), 'weatherEntity must be an entity id'],
    [isCalendarList(config.calendars), 'calendars must be an array of { entity, name?, color }'],
    [!badList, `${badList} must be an array of { name, entity }`],
  ]) ?? validateSmartHome(config.smartHome) ?? validateDashboard(config.dashboard) ?? validatePlugins(config.plugins)
}
