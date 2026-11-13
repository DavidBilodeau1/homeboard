import path from 'path'
import { firstError, isObject, isOptionalPositive, isOptionalString } from '../../checks.js'
import { expensaveApi, expensaveConfigured, expensaveUrl } from './client.js'
import { expensaveMockApi } from './mock.js'
import { expensaveRouter } from './router.js'

const isCalendarList = (v) =>
  v === undefined || (Array.isArray(v) && v.every((row) => isObject(row) && Number.isInteger(row.id)))

const isOptionalNumber = (v) => v === undefined || Number.isFinite(v)
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const isTargetList = (v) => v === undefined || (Array.isArray(v) && v.every((row) => isObject(row) &&
  typeof row.name === 'string' && Number.isFinite(row.amount) && row.amount >= 0 && isDay(row.date) &&
  isOptionalNumber(row.balance) && (row.balanceDate === undefined || isDay(row.balanceDate))))

export default {
  id: 'expensave',
  service: { name: 'Expensave', url: expensaveUrl, configured: expensaveConfigured, mockable: true },
  validate: (settings) => firstError([
    [isCalendarList(settings.calendars), 'calendars must be an array of { id, name?, color? }'],
    [isOptionalPositive(settings.horizonDays), 'horizonDays must be a positive number'],
    [isOptionalPositive(settings.importEveryDays), 'importEveryDays must be a positive number'],
    [isOptionalNumber(settings.buffer), 'buffer must be a number'],
    [settings.payGoal === undefined || (Number.isFinite(settings.payGoal) && settings.payGoal >= 0), 'payGoal must be a number of 0 or more'],
    [isTargetList(settings.savingsTargets), 'savingsTargets must be an array of { name, amount, date: YYYY-MM-DD, balance?, balanceDate? }'],
    [isOptionalString(settings.currency), 'currency must be a string'],
  ]),
  router: ({ mock, dataDir, canWrite }) => expensaveRouter(mock ? expensaveMockApi() : expensaveApi, {
    stateFile: path.join(dataDir, 'bank-import.json'),
    canWrite,
  }),
}
