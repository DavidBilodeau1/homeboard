import express from 'express'

/**
 * Mock Home Assistant API — used when HA_URL/HA_TOKEN are missing or MOCK=1.
 * Lets you preview and develop the dashboard without a live HA instance.
 */

const iso = (d) => d.toISOString()
const at = (base, h, m = 0) => {
  const d = new Date(base)
  d.setHours(h, m, 0, 0)
  return d
}
const days = (base, n) => {
  const d = new Date(base)
  d.setDate(d.getDate() + n)
  return d
}
const dateStr = (d) => iso(d).slice(0, 10)

let uidSeq = 1000
const mkItems = (defs) => defs.map(([summary, done]) => ({
  uid: `mock-${uidSeq++}`,
  summary,
  status: done ? 'completed' : 'needs_action',
}))

const todos = {
  'todo.reminders': mkItems([
    ['Call the bank', true], ['Renew car registration', false], ['Book dentist appointment', false],
    ['Change furnace filter', false], ['Backup family photos', false],
  ]),
  'todo.parents': mkItems([['Plan weekend trip', true], ['Sign school forms', false], ['Order birthday gift', false]]),
  'todo.maison': mkItems([['Mop the floor', false], ['Water the plants', true], ['Clean the gutters', false], ['Fix the fence', false], ['Organize garage', true]]),
  'todo.chalet': mkItems([['Close water valve', false], ['Bring firewood', false], ['Check propane level', false], ['Pack snow shovel', false]]),
  'todo.epicerie': mkItems([['Milk', false], ['Eggs', false]]),
  'todo.costco': mkItems([['Paper towels', false], ['Chicken breasts', false]]),
  'todo.a_decongeler': mkItems([['Ground beef', false], ['Tourtière', false]]),
  'todo.shopping_list': mkItems([['AA batteries', false], ['Light bulbs', false]]),
  'todo.belley': mkItems([['Return borrowed drill', false]]),
  'todo.peinture': mkItems([['Buy painter tape', false]]),
  'todo.montreal': mkItems([]),
}

const buildEvents = () => {
  const now = new Date()
  const ev = (cal, summary, start, end, allDay = false) => ({
    calendar: cal,
    summary,
    start: allDay ? { date: dateStr(start) } : { dateTime: iso(start) },
    end: allDay ? { date: dateStr(end) } : { dateTime: iso(end) },
    description: null,
    location: null,
  })
  return [
    ev('calendar.famille', 'Wake up kids', at(now, 7), at(now, 7, 30)),
    ev('calendar.work', 'Work', at(now, 9), at(now, 18)),
    ev('calendar.work', 'Con-call', at(now, 9, 30), at(now, 10, 30)),
    ev('calendar.home', 'Mop the floor', at(now, 17), at(now, 17, 30)),
    ev('calendar.famille', 'Walk the dog', at(now, 18), at(now, 18, 30)),
    ev('calendar.famille', 'Soccer practice', at(days(now, 1), 16), at(days(now, 1), 17, 30)),
    ev('calendar.famille', 'Dinner at grandma’s', at(days(now, 2), 17, 30), at(days(now, 2), 20)),
    ev('calendar.home', 'Recycling pickup', days(now, 3), days(now, 4), true),
    ev('calendar.work', 'Sprint review', at(days(now, 4), 14), at(days(now, 4), 15)),
    ev('calendar.famille', 'Weekend at the chalet', days(now, 5), days(now, 7), true),
    ev('calendar.famille', 'Dentist — kids', at(days(now, -2), 10), at(days(now, -2), 11)),
    ev('calendar.home', 'Lawn mowing', at(days(now, -4), 16), at(days(now, -4), 17)),
  ]
}

// mutable smart-home fixtures so service calls have visible effects
const live = {
  'climate.tstat_05c045_t6_pro_thermostat': {
    state: 'cool',
    attributes: {
      hvac_modes: ['off', 'heat', 'cool'], min_temp: 10, max_temp: 32,
      current_temperature: 22.5, temperature: 24, hvac_action: 'idle',
      friendly_name: 'Thermostat',
    },
  },
  'light.salon_salon': { state: 'off', attributes: { friendly_name: 'Salon' } },
  'light.salon_lampe_du_salon': { state: 'on', attributes: { friendly_name: 'Lampe salon' } },
  'light.chambre_chambre': { state: 'off', attributes: { friendly_name: 'Ch. principale' } },
  'light.chambre_de_timothee_chambre_de_timothee': { state: 'off', attributes: { friendly_name: 'Ch. Timothée' } },
  'light.chambre_dalphonse_chambre_dalphonse': { state: 'on', attributes: { friendly_name: 'Ch. Alphonse' } },
  'camera.front_door_doorbell_fluent': { state: 'idle', attributes: { friendly_name: 'Porte avant' } },
  'lock.front_door': { state: 'locked', attributes: { friendly_name: 'Porte avant' } },
  'alarm_control_panel.home_alarm': { state: 'disarmed', attributes: { friendly_name: 'Home Alarm' } },
  'sensor.pool_thermometer_pool_thermometer': {
    state: '77.6', attributes: { unit_of_measurement: '°F', device_class: 'temperature' },
  },
  'sensor.saguenay_secteur_de_sainte_therese_arvida_quebec_canada_air_quality_index': {
    state: '41', attributes: { device_class: 'aqi' },
  },
  'sensor.uv_index': { state: '5', attributes: {} },
  'sensor.feels_like_temperature': { state: '11', attributes: { unit_of_measurement: '°C' } },
}

const states = () => ({
  ...Object.fromEntries(Object.entries(live).map(([id, s]) => [id, { entity_id: id, ...s }])),
  'weather.pirateweather': {
    entity_id: 'weather.pirateweather',
    state: 'sunny',
    attributes: { temperature: 31, temperature_unit: '°C', friendly_name: 'PirateWeather' },
  },
  'counter.david_stars': { entity_id: 'counter.david_stars', state: String(counters['counter.david_stars']), attributes: {} },
  'counter.amelie_stars': { entity_id: 'counter.amelie_stars', state: String(counters['counter.amelie_stars']), attributes: {} },
  'sun.sun': {
    entity_id: 'sun.sun',
    state: new Date().getHours() >= 7 && new Date().getHours() < 20 ? 'above_horizon' : 'below_horizon',
    attributes: {},
  },
  'person.david': { entity_id: 'person.david', state: 'home', attributes: { friendly_name: 'David' } },
  'person.amelie': { entity_id: 'person.amelie', state: 'not_home', attributes: { friendly_name: 'Amélie' } },
  // garbage schedule sensors (device_class timestamp): recycle tomorrow, compost +3, trash +9
  'sensor.saguenay_recuperation_schedule': { entity_id: 'sensor.saguenay_recuperation_schedule', state: iso(at(days(new Date(), 1), 0)), attributes: { device_class: 'timestamp', friendly_name: 'Récupération' } },
  'sensor.saguenay_compostage_schedule': { entity_id: 'sensor.saguenay_compostage_schedule', state: iso(at(days(new Date(), 3), 0)), attributes: { device_class: 'timestamp', friendly_name: 'Compostage' } },
  'sensor.saguenay_ordure_schedule': { entity_id: 'sensor.saguenay_ordure_schedule', state: iso(at(days(new Date(), 9), 0)), attributes: { device_class: 'timestamp', friendly_name: 'Ordure' } },
})

const counters = { 'counter.david_stars': 12, 'counter.amelie_stars': 8 }

const forecast = () => {
  const now = new Date()
  const conds = ['sunny', 'partlycloudy', 'rainy', 'sunny', 'cloudy']
  return conds.map((condition, i) => ({
    datetime: iso(days(now, i)),
    condition,
    temperature: 31 - i * 2,
    templow: 19 - i,
  }))
}

export function mockRouter() {
  const r = express.Router()

  r.get('/config', (_req, res) => res.json({ location_name: 'Home', version: 'mock', time_zone: 'America/Toronto' }))

  // full listing feeds the settings editor's entity dropdowns
  r.get('/states', (_req, res) => {
    const all = Object.values(states())
    for (const id of Object.keys(todos)) {
      all.push({ entity_id: id, state: '0', attributes: { friendly_name: id.split('.')[1].replace(/_/g, ' ') } })
    }
    for (const id of ['calendar.famille', 'calendar.home', 'calendar.work']) {
      all.push({ entity_id: id, state: 'off', attributes: { friendly_name: id.split('.')[1] } })
    }
    res.json(all)
  })

  r.get('/states/:id', (req, res) => {
    const s = states()[req.params.id]
    if (s) return res.json(s)
    res.status(404).json({ message: 'Entity not found.' })
  })

  r.get('/calendars/:id', (req, res) => {
    const { start, end } = req.query
    const s = start ? new Date(String(start)) : new Date()
    const e = end ? new Date(String(end)) : new Date(Date.now() + 7 * 864e5)
    const evs = buildEvents().filter((ev) => {
      if (ev.calendar !== req.params.id) return false
      const evStart = new Date(ev.start.dateTime ?? ev.start.date)
      const evEnd = new Date(ev.end.dateTime ?? ev.end.date)
      return evEnd >= s && evStart <= e
    })
    res.json(evs.map(({ calendar, ...rest }) => rest))
  })

  r.post('/services/todo/get_items', (req, res) => {
    const ids = [].concat(req.body?.entity_id ?? [])
    const out = {}
    for (const id of ids) out[id] = { items: todos[id] ?? [] }
    res.json({ changed_states: [], service_response: out })
  })

  r.post('/services/todo/update_item', (req, res) => {
    const { entity_id, item, status } = req.body ?? {}
    const list = todos[entity_id] ?? []
    const found = list.find((i) => i.uid === item || i.summary === item)
    if (found && status) found.status = status
    res.json([])
  })

  r.post('/services/todo/add_item', (req, res) => {
    const { entity_id, item } = req.body ?? {}
    if (todos[entity_id] && item) todos[entity_id].push(mkItems([[item, false]])[0])
    res.json([])
  })

  r.post('/services/todo/remove_item', (req, res) => {
    const { entity_id, item } = req.body ?? {}
    if (todos[entity_id]) todos[entity_id] = todos[entity_id].filter((i) => i.uid !== item && i.summary !== item)
    res.json([])
  })

  r.post('/services/weather/get_forecasts', (req, res) => {
    const ids = [].concat(req.body?.entity_id ?? [])
    const out = {}
    for (const id of ids) out[id] = { forecast: forecast() }
    res.json({ changed_states: [], service_response: out })
  })

  r.post('/services/counter/:dir', (req, res) => {
    const id = req.body?.entity_id
    if (id in counters) counters[id] += req.params.dir === 'increment' ? 1 : -1
    res.json([])
  })

  // ---- smart home ----
  r.get('/camera_proxy/:id', (_req, res) => {
    res.type('image/svg+xml').send(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
        <rect width="640" height="360" fill="#2b3440"/>
        <circle cx="320" cy="150" r="46" fill="none" stroke="#5b6b7d" stroke-width="8"/>
        <circle cx="320" cy="150" r="18" fill="#5b6b7d"/>
        <text x="320" y="260" fill="#8fa0b3" font-family="sans-serif" font-size="26" text-anchor="middle">Mock camera — ${new Date().toLocaleTimeString()}</text>
      </svg>`,
    )
  })

  r.post('/services/light/:svc', (req, res) => {
    for (const id of [].concat(req.body?.entity_id ?? [])) {
      if (live[id]) live[id].state = req.params.svc === 'turn_on' ? 'on' : req.params.svc === 'turn_off' ? 'off' : live[id].state === 'on' ? 'off' : 'on'
    }
    res.json([])
  })

  r.post('/services/climate/set_temperature', (req, res) => {
    const c = live[req.body?.entity_id]
    if (c && typeof req.body?.temperature === 'number') c.attributes.temperature = req.body.temperature
    res.json([])
  })

  r.post('/services/climate/set_hvac_mode', (req, res) => {
    const c = live[req.body?.entity_id]
    if (c && req.body?.hvac_mode) c.state = req.body.hvac_mode
    res.json([])
  })

  r.post('/services/lock/:svc', (req, res) => {
    const l = live[req.body?.entity_id]
    if (l) l.state = req.params.svc === 'lock' ? 'locked' : 'unlocked'
    res.json([])
  })

  r.post('/services/alarm_control_panel/:svc', (req, res) => {
    const a = live[req.body?.entity_id]
    if (a) {
      a.state = { alarm_disarm: 'disarmed', alarm_arm_home: 'armed_home', alarm_arm_away: 'armed_away', alarm_arm_night: 'armed_night' }[req.params.svc] ?? a.state
    }
    res.json([])
  })

  r.all('*', (_req, res) => res.status(404).json({ message: 'mock: not implemented' }))
  return r
}
