import path from 'path'
import { firstError, isObject, isOptionalPositive, isOptionalString } from '../../checks.js'
import { expensaveApi, expensaveConfigured, expensaveUrl } from './client.js'
import { expensaveMockApi } from './mock.js'
import { expensaveRouter } from './router.js'

const isCalendarList = (v) =>
  v === undefined || (Array.isArray(v) && v.every((row) => isObject(row) && Number.isInteger(row.id)))

const isOptionalNumber = (v) => v === undefined || Number.isFinite(v)

export default {
  id: 'expensave',
  service: { name: 'Expensave', url: expensaveUrl, configured: expensaveConfigured, mockable: true },
  validate: (settings) => firstError([
    [isCalendarList(settings.calendars), 'calendars must be an array of { id, name?, color? }'],
    [isOptionalPositive(settings.horizonDays), 'horizonDays must be a positive number'],
    [isOptionalPositive(settings.importEveryDays), 'importEveryDays must be a positive number'],
    [isOptionalNumber(settings.buffer), 'buffer must be a number'],
    [isOptionalNumber(settings.weeklyGoal), 'weeklyGoal must be a number'],
    [isOptionalString(settings.currency), 'currency must be a string'],
  ]),
  router: ({ mock, dataDir, canWrite }) => expensaveRouter(mock ? expensaveMockApi() : expensaveApi, {
    stateFile: path.join(dataDir, 'bank-import.json'),
    canWrite,
  }),
}
