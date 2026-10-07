import express from 'express'
import { EventEmitter } from 'events'
import { nhlState, startGoalFeed } from './nhl.js'

/** Demo Home Assistant for MOCK mode, holding the entities config.example.json refers to. */
export const mockHaEvents = new EventEmitter()

const NHL_SENSOR = 'sensor.nhl_mtl'
const CALENDARS = ['calendar.family', 'calendar.home', 'calendar.work']
const TOGGLE_DOMAINS = new Set(['light', 'switch', 'fan', 'input_boolean'])
const ALARM_STATES = {
  alarm_disarm: 'disarmed',
  alarm_arm_home: 'armed_home',
  alarm_arm_away: 'armed_away',
  alarm_arm_night: 'armed_night',
}

const iso = (d) => d.toISOString()
const dateOnly = (d) => iso(d).slice(0, 10)
const daysFromNow = (n, hour = 0, minute = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(hour, minute, 0, 0)
  return d
}

let nextUid = 1000
const todoItems = (rows) => rows.map(([summary, done]) => ({
  uid: `mock-${nextUid++}`,
  summary,
  status: done ? 'completed' : 'needs_action',
}))

const todos = {
  'todo.alex': todoItems([['Make the bed', true], ['Homework', false], ['Feed the cat', false]]),
  'todo.sam': todoItems([['Practice piano', false], ['Tidy the room', true]]),
  'todo.house': todoItems([['Mop the floor', false], ['Water the plants', true], ['Clean the gutters', false], ['Change furnace filter', false]]),
  'todo.menu': todoItems([['Tacos', false], ['Lasagna', false], ['Soup & grilled cheese', false]]),
  'todo.groceries': todoItems([['Milk', false], ['Eggs', false], ['Apples', false]]),
  'todo.shopping_list': todoItems([['AA batteries', false], ['Light bulbs', false]]),
}

const counters = { 'counter.alex_stars': 12, 'counter.sam_stars': 8 }

const calendarEvent = (calendar, summary, start, end, allDay = false) => ({
  calendar,
  summary,
  start: allDay ? { date: dateOnly(start) } : { dateTime: iso(start) },
  end: allDay ? { date: dateOnly(end) } : { dateTime: iso(end) },
})

const calendarEvents = () => [
  calendarEvent('calendar.family', 'School drop-off', daysFromNow(0, 7, 45), daysFromNow(0, 8, 15)),
  calendarEvent('calendar.work', 'Team meeting', daysFromNow(0, 9, 30), daysFromNow(0, 10, 30)),
  calendarEvent('calendar.home', 'Mop the floor', daysFromNow(0, 17), daysFromNow(0, 17, 30)),
  calendarEvent('calendar.family', 'Walk the dog', daysFromNow(0, 18), daysFromNow(0, 18, 30)),
  calendarEvent('calendar.family', 'Soccer practice', daysFromNow(1, 16), daysFromNow(1, 17, 30)),
  calendarEvent('calendar.family', 'Dinner with grandparents', daysFromNow(2, 17, 30), daysFromNow(2, 20)),
  calendarEvent('calendar.work', 'Sprint review', daysFromNow(4, 14), daysFromNow(4, 15)),
  calendarEvent('calendar.family', 'Weekend at the lake', daysFromNow(5), daysFromNow(7), true),
  calendarEvent('calendar.family', 'Dentist', daysFromNow(-2, 10), daysFromNow(-2, 11)),
  calendarEvent('calendar.home', 'Lawn mowing', daysFromNow(-4, 16), daysFromNow(-4, 17)),
]

const devices = {
  'climate.thermostat': {
    state: 'heat',
    attributes: {
      hvac_modes: ['off', 'heat', 'cool'], min_temp: 10, max_temp: 32,
      current_temperature: 20.5, temperature: 21, hvac_action: 'heating', friendly_name: 'Thermostat',
    },
  },
  'light.living_room': { state: 'on', attributes: { friendly_name: 'Living room' } },
  'light.kitchen': { state: 'off', attributes: { friendly_name: 'Kitchen' } },
  'light.bedroom': { state: 'off', attributes: { friendly_name: 'Bedroom' } },
  'camera.front_door': { state: 'idle', attributes: { friendly_name: 'Front door' } },
  'lock.front_door': { state: 'locked', attributes: { friendly_name: 'Front door' } },
  'alarm_control_panel.home_alarm': { state: 'disarmed', attributes: { friendly_name: 'Home alarm' } },
  'media_player.living_room': {
    state: 'playing',
    attributes: { friendly_name: 'Living room', media_title: 'Here Comes the Sun', media_artist: 'The Beatles', volume_level: 0.35 },
  },
  'media_player.kitchen': {
    state: 'paused',
    attributes: { friendly_name: 'Kitchen', media_title: 'Morning news', volume_level: 0.2 },
  },
  'sensor.pool_temperature': { state: '25.4', attributes: { unit_of_measurement: '°C', device_class: 'temperature', friendly_name: 'Pool' } },
  'sensor.air_quality_index': { state: '41', attributes: { device_class: 'aqi', friendly_name: 'Air quality index' } },
  'sensor.uv_index': { state: '5', attributes: { friendly_name: 'UV index' } },
  'sensor.feels_like_temperature': { state: '11', attributes: { unit_of_measurement: '°C', friendly_name: 'Feels like' } },
}

const collectionSensor = (name, inDays) => ({
  state: iso(daysFromNow(inDays)),
  attributes: { device_class: 'timestamp', friendly_name: name },
})

const forecast = () => ['sunny', 'partlycloudy', 'rainy', 'sunny', 'cloudy'].map((condition, i) => ({
  datetime: iso(daysFromNow(i, 12)),
  condition,
  temperature: 24 - i * 2,
  templow: 14 - i,
}))

const nameOf = (entityId) => entityId.split('.')[1].replace(/_/g, ' ')

const isDaytime = () => {
  const hour = new Date().getHours()
  return hour >= 7 && hour < 20
}

function allStates() {
  const states = {
    ...devices,
    'weather.home': { state: 'sunny', attributes: { temperature: 22, temperature_unit: '°C', friendly_name: 'Home' } },
    'sun.sun': { state: isDaytime() ? 'above_horizon' : 'below_horizon', attributes: {} },
    'person.alex': { state: 'home', attributes: { friendly_name: 'Alex' } },
    'person.sam': { state: 'not_home', attributes: { friendly_name: 'Sam' } },
    'sensor.recycling_schedule': collectionSensor('Recycling', 1),
    'sensor.compost_schedule': collectionSensor('Compost', 3),
    'sensor.trash_schedule': collectionSensor('Trash', 9),
    [NHL_SENSOR]: nhlState(),
    ...Object.fromEntries(Object.entries(counters).map(([id, value]) => [id, { state: String(value), attributes: {} }])),
    ...Object.fromEntries(Object.keys(todos).map((id) => [id, { state: String(todos[id].length), attributes: { friendly_name: nameOf(id) } }])),
    ...Object.fromEntries(CALENDARS.map((id) => [id, { state: 'off', attributes: { friendly_name: nameOf(id) } }])),
  }
  return Object.fromEntries(Object.entries(states).map(([id, s]) => [id, { entity_id: id, ...s }]))
}

const targets = (body) => [].concat(body?.entity_id ?? [])

function setState(entityId, state) {
  if (!devices[entityId]) return
  devices[entityId].state = state
  mockHaEvents.emit('state_changed', entityId)
}

const toggled = (service, current) => (service === 'turn_on' ? 'on' : service === 'turn_off' ? 'off' : current === 'on' ? 'off' : 'on')

const MEDIA_STATES = { media_play: 'playing', media_pause: 'paused' }

function updateMediaPlayer(entityId, service, body) {
  const player = devices[entityId]
  if (!player) return
  if (service === 'volume_set' && typeof body.volume_level === 'number') player.attributes.volume_level = body.volume_level
  if (service === 'media_play_pause') player.state = player.state === 'playing' ? 'paused' : 'playing'
  if (MEDIA_STATES[service]) player.state = MEDIA_STATES[service]
  mockHaEvents.emit('state_changed', entityId)
}

function serviceResponse(ids, build) {
  return { changed_states: [], service_response: Object.fromEntries(ids.map((id) => [id, build(id)])) }
}

export function mockHaRouter() {
  const router = express.Router()
  const ok = (res) => res.json([])
  startGoalFeed(NHL_SENSOR, (id) => mockHaEvents.emit('state_changed', id))

  router.get('/config', (_req, res) => res.json({ location_name: 'Home', version: 'mock', time_zone: 'America/Toronto' }))
  router.get('/states', (_req, res) => res.json(Object.values(allStates())))
  router.get('/states/:id', (req, res) => {
    const state = allStates()[req.params.id]
    if (state) return res.json(state)
    res.status(404).json({ message: 'Entity not found.' })
  })

  router.get('/calendars/:id', (req, res) => {
    const from = req.query.start ? new Date(String(req.query.start)) : new Date()
    const to = req.query.end ? new Date(String(req.query.end)) : daysFromNow(7)
    const inRange = (e) => new Date(e.end.dateTime ?? e.end.date) >= from && new Date(e.start.dateTime ?? e.start.date) <= to
    res.json(calendarEvents().filter((e) => e.calendar === req.params.id && inRange(e)).map(({ calendar: _calendar, ...e }) => e))
  })

  router.post('/services/todo/get_items', (req, res) => res.json(serviceResponse(targets(req.body), (id) => ({ items: todos[id] ?? [] }))))
  router.post('/services/todo/update_item', (req, res) => {
    const { entity_id: id, item, status } = req.body ?? {}
    const found = todos[id]?.find((i) => i.uid === item || i.summary === item)
    if (found && status) found.status = status
    mockHaEvents.emit('state_changed', id)
    ok(res)
  })
  router.post('/services/todo/add_item', (req, res) => {
    const { entity_id: id, item } = req.body ?? {}
    if (todos[id] && item) todos[id].push(...todoItems([[item, false]]))
    mockHaEvents.emit('state_changed', id)
    ok(res)
  })
  router.post('/services/todo/remove_item', (req, res) => {
    const { entity_id: id, item } = req.body ?? {}
    if (todos[id]) todos[id] = todos[id].filter((i) => i.uid !== item && i.summary !== item)
    mockHaEvents.emit('state_changed', id)
    ok(res)
  })

  router.post('/services/weather/get_forecasts', (req, res) => res.json(serviceResponse(targets(req.body), () => ({ forecast: forecast() }))))

  router.post('/services/counter/:direction', (req, res) => {
    const id = req.body?.entity_id
    if (id in counters) counters[id] += req.params.direction === 'increment' ? 1 : -1
    mockHaEvents.emit('state_changed', id)
    ok(res)
  })

  router.post('/services/:domain/:service', (req, res, next) => {
    const { domain, service } = req.params
    if (!TOGGLE_DOMAINS.has(domain)) return next()
    for (const id of targets(req.body)) setState(id, toggled(service, devices[id]?.state))
    ok(res)
  })
  router.post('/services/climate/:service', (req, res) => {
    const id = req.body?.entity_id
    const climate = devices[id]
    if (climate && typeof req.body.temperature === 'number') climate.attributes.temperature = req.body.temperature
    if (climate && req.body.hvac_mode) climate.state = req.body.hvac_mode
    mockHaEvents.emit('state_changed', id)
    ok(res)
  })
  router.post('/services/lock/:service', (req, res) => {
    setState(req.body?.entity_id, req.params.service === 'lock' ? 'locked' : 'unlocked')
    ok(res)
  })
  router.post('/services/alarm_control_panel/:service', (req, res) => {
    const state = ALARM_STATES[req.params.service]
    if (state) setState(req.body?.entity_id, state)
    ok(res)
  })
  router.post('/services/media_player/:service', (req, res) => {
    updateMediaPlayer(req.body?.entity_id, req.params.service, req.body)
    ok(res)
  })

  router.all('*', (_req, res) => res.status(404).json({ message: 'mock: not implemented' }))
  return router
}
