import { firstError, isObject } from '../checks.js'

const isOptionalArray = (v) => v === undefined || Array.isArray(v)

export default {
  id: 'floorPlan',
  validate: (settings) => firstError([
    [settings.house === undefined || isObject(settings.house), 'house must be an object'],
    [isOptionalArray(settings.floors), 'floors must be an array'],
    [isOptionalArray(settings.exterior), 'exterior must be an array'],
    [isOptionalArray(settings.devices), 'devices must be an array'],
    [settings.layout === undefined || isObject(settings.layout), 'layout must be an object'],
  ]),
}
