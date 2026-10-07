import { firstError, isNamedRows } from '../checks.js'

export default {
  id: 'garbage',
  validate: (settings) => firstError([
    [isNamedRows(settings.collections), 'collections must be an array of { name, entity, color }'],
  ]),
}
