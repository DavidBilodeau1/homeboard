import { firstError, isOptionalString } from '../checks.js'

export default {
  id: 'airQuality',
  validate: (settings) => firstError([
    [isOptionalString(settings.entity), 'entity must be an AQI sensor id'],
    [isOptionalString(settings.name), 'name must be a string'],
    [settings.safeMax === undefined || Number.isFinite(settings.safeMax), 'safeMax must be a number'],
  ]),
}
