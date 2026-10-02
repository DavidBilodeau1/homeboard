import { firstError, isOptionalString } from '../checks.js'

export default {
  id: 'hockey',
  validate: (settings) => firstError([
    [isOptionalString(settings.entity), 'entity must be an NHL API sensor id'],
    [isOptionalString(settings.team), 'team must be a team abbreviation'],
  ]),
}
