// Server-side validation for PUT /api/config. Unknown keys are deliberately
// ignored so the schema can grow without a server change.

const isNamedRows = (v) =>
  v === undefined ||
  (Array.isArray(v) && v.every((r) => r && typeof r === 'object' && typeof r.name === 'string' &&
    (r.entity === null || r.entity === undefined || typeof r.entity === 'string')))

export function validateConfig(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return 'config must be a JSON object'
  if (typeof c.weatherEntity !== 'string' || !c.weatherEntity) return 'weatherEntity must be a non-empty string'
  for (const k of ['calendars', 'tasks', 'meals', 'lists', 'rewards']) {
    if (k === 'calendars') {
      if (!Array.isArray(c.calendars) || !c.calendars.every((r) => r && typeof r.entity === 'string')) {
        return 'calendars must be an array of { entity, name?, color }'
      }
    } else if (!isNamedRows(c[k])) return `${k} must be an array of { name, entity }`
  }
  if (c.smartHome !== undefined) {
    const sh = c.smartHome
    if (!sh || typeof sh !== 'object' || Array.isArray(sh)) return 'smartHome must be an object'
    for (const k of ['sensors', 'lights', 'locks', 'mediaPlayers']) {
      if (!isNamedRows(sh[k])) return `smartHome.${k} must be an array of { name, entity }`
    }
  }
  if (c.frigate !== undefined && c.frigate !== null) {
    const f = c.frigate
    if (typeof f !== 'object' || Array.isArray(f)) return 'frigate must be an object'
    if (f.cameras !== undefined && !(Array.isArray(f.cameras) && f.cameras.every((n) => typeof n === 'string'))) {
      return 'frigate.cameras must be an array of Frigate camera names'
    }
    for (const k of ['refreshSeconds', 'pollSeconds', 'alertLimit']) {
      if (f[k] !== undefined && !(Number.isFinite(f[k]) && f[k] > 0)) return `frigate.${k} must be a positive number`
    }
  }
  if (c.garbage !== undefined && !isNamedRows(c.garbage)) {
    return 'garbage must be an array of { name, entity, color }'
  }
  if (c.airQuality !== undefined && c.airQuality !== null) {
    const a = c.airQuality
    if (typeof a !== 'object' || Array.isArray(a) || typeof a.entity !== 'string') {
      return 'airQuality must be an object with an entity string'
    }
  }
  if (c.dashboard !== undefined) {
    const d = c.dashboard
    if (!d || typeof d !== 'object' || Array.isArray(d)) return 'dashboard must be an object'
    if (!Array.isArray(d.tiles)) return 'dashboard.tiles must be an array'
    const ok = d.tiles.every((tile) => tile && typeof tile.id === 'string' &&
      ['x', 'y', 'w', 'h'].every((f) => Number.isFinite(tile[f])))
    if (!ok) return 'dashboard.tiles items must be { id, x, y, w, h }'
  }
  return null
}
