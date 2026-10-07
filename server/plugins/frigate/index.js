import { firstError, isOptionalPositive } from '../../checks.js'
import { frigateUrl } from './client.js'
import { frigateMockRouter } from './mock.js'
import { frigateRouter } from './router.js'

const isCameraList = (v) => v === undefined || (Array.isArray(v) && v.every((name) => typeof name === 'string'))

export default {
  id: 'frigate',
  service: { name: 'Frigate', url: frigateUrl, configured: Boolean(frigateUrl), mockable: true },
  validate: (settings) => firstError([
    [isCameraList(settings.cameras), 'cameras must be an array of Frigate camera names'],
    ...['refreshSeconds', 'pollSeconds', 'alertLimit'].map((key) =>
      [isOptionalPositive(settings[key]), `${key} must be a positive number`]),
  ]),
  router: ({ mock }) => (mock ? frigateMockRouter() : frigateRouter()),
}
