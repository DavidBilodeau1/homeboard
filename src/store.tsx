import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { AppConfig, CalEvent, TodoItem, ForecastDay, WeatherState, ThemeMode, EntityState, PersonState, GarbageCollection } from './types'
import * as api from './api'
import { addDays, dayKey, monthGrid, startOfMonth } from './util'
import { makeT, resolveLanguage, type Translate } from './i18n'

interface SystemInfo {
  location_name?: string
  version?: string
}

interface Store {
  config: AppConfig | null
  locale: string
  language: string
  t: Translate
  now: Date
  todos: Record<string, TodoItem[]>
  events: CalEvent[]
  weather: WeatherState | null
  forecast: ForecastDay[]
  rewardValues: Record<string, number | null>
  photos: string[]
  systemInfo: SystemInfo | null
  connected: boolean
  themeMode: ThemeMode
  resolvedTheme: 'light' | 'dark'
  setThemeMode: (m: ThemeMode) => void
  monthCursor: Date
  setMonthCursor: (d: Date) => void
  selectedDate: Date
  setSelectedDate: (d: Date) => void
  toggleItem: (entity: string, item: TodoItem) => Promise<void>
  addItem: (entity: string, summary: string) => Promise<void>
  removeItem: (entity: string, uid: string) => Promise<void>
  adjustReward: (entity: string, dir: 'increment' | 'decrement') => Promise<void>
  entityStates: Record<string, EntityState | null>
  callService: (domain: string, service: string, data: Record<string, unknown>) => Promise<void>
  trackEntities: (ids: string[]) => void
  reloadConfig: () => Promise<void>
  saveConfig: (next: AppConfig) => Promise<boolean>
  persons: PersonState[]
  garbage: GarbageCollection[]
}

const garbageEntities = (cfg: AppConfig | null): string[] =>
  (cfg?.garbage ?? []).map((g) => g.entity).filter(Boolean)

/** Every entity id referenced by the smartHome config section. */
const smartHomeEntities = (cfg: AppConfig | null): string[] => {
  const sh = cfg?.smartHome
  if (!sh) return []
  return [
    sh.climate,
    sh.alarm,
    ...(sh.cameras ?? []).map((c) => c.entity),
    ...(sh.sensors ?? []).map((s) => s.entity),
    ...(sh.lights ?? []).map((l) => l.entity),
    ...(sh.locks ?? []).map((l) => l.entity),
  ].filter((e): e is string => !!e)
}

const Ctx = createContext<Store | null>(null)

export const useStore = () => {
  const s = useContext(Ctx)
  if (!s) throw new Error('store missing')
  return s
}

const normalizeEvents = (raw: any[], entity: string, color: string): CalEvent[] =>
  raw.map((e) => {
    const allDay = !!e.start?.date
    const start: string = e.start?.dateTime ?? e.start?.date ?? ''
    const end: string = e.end?.dateTime ?? e.end?.date ?? start
    const dayKeys: string[] = []
    let d = new Date(allDay ? start + 'T00:00:00' : start)
    // all-day events end on the day AFTER the last day (exclusive)
    const stop = allDay ? addDays(new Date(end + 'T00:00:00'), -1) : new Date(end)
    for (let i = 0; i < 60; i++) {
      dayKeys.push(dayKey(d))
      if (dayKey(d) >= dayKey(stop)) break
      d = addDays(d, 1)
    }
    return { summary: e.summary ?? '(no title)', start, end, allDay, calendar: entity, color, dayKeys }
  })

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [now, setNow] = useState(new Date())
  const [todos, setTodos] = useState<Record<string, TodoItem[]>>({})
  const [calEvents, setCalEvents] = useState<CalEvent[]>([])
  const [garbage, setGarbage] = useState<GarbageCollection[]>([])
  const [weather, setWeather] = useState<WeatherState | null>(null)
  const [forecast, setForecast] = useState<ForecastDay[]>([])
  const [rewardValues, setRewardValues] = useState<Record<string, number | null>>({})
  const [photos, setPhotos] = useState<string[]>([])
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [connected, setConnected] = useState(false)
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [entityStates, setEntityStates] = useState<Record<string, EntityState | null>>({})
  const [persons, setPersons] = useState<PersonState[]>([])
  const [themeMode, setThemeModeState] = useState<ThemeMode>(
    () => (localStorage.getItem('homeboard-theme') as ThemeMode) || 'auto',
  )
  const [osDark, setOsDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [sunBelow, setSunBelow] = useState(false)
  // entities registered by pages (e.g. floor plan) to keep live in addition to config
  const extraRef = useRef<string[]>([])

  const locale = config?.locale || navigator.language
  const language = resolveLanguage(config?.language, locale)
  const t = useMemo(() => makeT(language), [language])

  // ----- refreshers -----
  const refreshTodos = useCallback(async (cfg: AppConfig) => {
    const entities = [
      ...cfg.tasks, ...cfg.meals, ...(cfg.lists ?? []),
    ].map((l) => l.entity).filter((e): e is string => !!e)
    const unique = [...new Set(entities)]
    const res = await api.getTodoItems(unique)
    const map: Record<string, TodoItem[]> = {}
    for (const id of unique) map[id] = res[id]?.items ?? []
    setTodos(map)
  }, [])

  const refreshEvents = useCallback(async (cfg: AppConfig, cursor: Date) => {
    const grid = monthGrid(cursor)
    const start = grid[0].toISOString()
    const end = addDays(grid[41], 1).toISOString()
    const all = await Promise.all(
      cfg.calendars.map(async (c) => normalizeEvents(await api.getCalendarEvents(c.entity, start, end), c.entity, c.color)),
    )
    setCalEvents(all.flat().sort((a, b) => a.start.localeCompare(b.start)))
  }, [])

  const refreshWeather = useCallback(async (cfg: AppConfig) => {
    const st = await api.getState(cfg.weatherEntity)
    if (st) {
      setWeather({
        state: st.state,
        temperature: st.attributes?.temperature ?? null,
        unit: st.attributes?.temperature_unit ?? '°',
      })
    }
    setForecast(await api.getForecast(cfg.weatherEntity))
  }, [])

  const refreshEntities = useCallback(async (cfg: AppConfig) => {
    const ids = [...new Set([...smartHomeEntities(cfg), ...extraRef.current])]
    if (!ids.length) return
    const results = await Promise.all(ids.map((id) => api.getState(id)))
    setEntityStates((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id, i) => [id, results[i]])) }))
  }, [])

  // let a page keep an arbitrary set of entities live (states + websocket updates)
  const trackEntities = useCallback((ids: string[]) => {
    const unique = [...new Set(ids.filter(Boolean))]
    extraRef.current = unique
    if (!unique.length) return
    Promise.all(unique.map((id) => api.getState(id))).then((results) =>
      setEntityStates((prev) => ({ ...prev, ...Object.fromEntries(unique.map((id, i) => [id, results[i]])) })),
    )
  }, [])

  const refreshSun = useCallback(async () => {
    const st = await api.getState('sun.sun')
    if (st) setSunBelow(st.state === 'below_horizon')
  }, [])

  const refreshPersons = useCallback(async () => {
    const all = await api.haGet('states').catch(() => null)
    if (!Array.isArray(all)) return
    setPersons(
      all
        .filter((s: any) => typeof s.entity_id === 'string' && s.entity_id.startsWith('person.'))
        .map((s: any) => ({ entity: s.entity_id, name: s.attributes?.friendly_name ?? s.entity_id, state: s.state })),
    )
  }, [])

  const refreshRewards = useCallback(async (cfg: AppConfig) => {
    const map: Record<string, number | null> = {}
    await Promise.all(
      cfg.rewards.filter((r) => r.entity).map(async (r) => {
        const st = await api.getState(r.entity!)
        const v = st ? Number(st.state) : NaN
        map[r.entity!] = Number.isFinite(v) ? v : null
      }),
    )
    setRewardValues(map)
  }, [])

  const refreshGarbage = useCallback(async (cfg: AppConfig) => {
    const cfgs = cfg.garbage ?? []
    if (!cfgs.length) { setGarbage([]); return }
    const todayKey = dayKey(new Date())
    const results = await Promise.all(
      cfgs.map(async (g): Promise<GarbageCollection> => {
        const st = await api.getState(g.entity)
        const raw = st?.state
        const date = raw && raw !== 'unknown' && raw !== 'unavailable' ? new Date(raw) : null
        if (!date || isNaN(date.getTime())) return { name: g.name, color: g.color, dayKey: null, daysUntil: null }
        const k = dayKey(date)
        // whole-day difference between today and the collection's local day
        const diff = Math.round((new Date(k + 'T00:00:00').getTime() - new Date(todayKey + 'T00:00:00').getTime()) / 86_400_000)
        return { name: g.name, color: g.color, dayKey: k, daysUntil: diff }
      }),
    )
    setGarbage(results)
  }, [])

  const refreshAll = useCallback((cfg: AppConfig, cursor: Date) => {
    refreshTodos(cfg)
    refreshEvents(cfg, cursor)
    refreshWeather(cfg)
    refreshRewards(cfg)
    refreshEntities(cfg)
    refreshGarbage(cfg)
  }, [refreshTodos, refreshEvents, refreshWeather, refreshRewards, refreshEntities, refreshGarbage])

  // keep latest refresh closure available to the websocket handler
  const refresher = useRef<{ cfg: AppConfig | null; cursor: Date }>({ cfg: null, cursor: monthCursor })
  refresher.current = { cfg: config, cursor: monthCursor }

  // ----- boot -----
  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => setConfig(null))
    api.getPhotos().then(setPhotos)
    api.haGet('config').then((c) => { setSystemInfo(c); setConnected(true) }).catch(() => setConnected(false))
    refreshSun()
    refreshPersons()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ----- theme -----
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setOsDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // config default applies only when the user never chose a theme on this device
  useEffect(() => {
    if (config?.theme && !localStorage.getItem('homeboard-theme')) setThemeModeState(config.theme)
  }, [config])

  const setThemeMode = useCallback((m: ThemeMode) => {
    localStorage.setItem('homeboard-theme', m)
    setThemeModeState(m)
  }, [])

  const resolvedTheme: 'light' | 'dark' =
    themeMode === 'light' ? 'light'
    : themeMode === 'dark' ? 'dark'
    : themeMode === 'sun' ? (sunBelow ? 'dark' : 'light')
    : osDark ? 'dark' : 'light'

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
  }, [resolvedTheme])

  useEffect(() => {
    if (config) refreshAll(config, monthCursor)
  }, [config]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (config) refreshEvents(config, monthCursor)
  }, [monthCursor]) // eslint-disable-line react-hooks/exhaustive-deps

  // clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000)
    return () => clearInterval(t)
  }, [])

  // periodic full refresh (fallback if websocket misses something)
  useEffect(() => {
    const t = setInterval(() => {
      const { cfg, cursor } = refresher.current
      if (cfg) refreshAll(cfg, cursor)
      refreshSun()
      refreshPersons()
    }, 5 * 60_000)
    return () => clearInterval(t)
  }, [refreshAll, refreshSun, refreshPersons])

  // live updates over websocket
  useEffect(() => {
    let ws: WebSocket | null = null
    let alive = true
    let retry: ReturnType<typeof setTimeout>
    const timers: Record<string, ReturnType<typeof setTimeout>> = {}
    const debounced = (kind: string, fn: () => void) => {
      clearTimeout(timers[kind])
      timers[kind] = setTimeout(fn, 400)
    }
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws`)
      ws.onopen = () => setConnected(true)
      ws.onmessage = (e) => {
        const { cfg, cursor } = refresher.current
        if (!cfg) return
        try {
          const msg = JSON.parse(e.data)
          const id: string = msg.entity_id ?? ''
          if (id.startsWith('todo.')) debounced('todo', () => refreshTodos(cfg))
          else if (id.startsWith('calendar.')) debounced('cal', () => refreshEvents(cfg, cursor))
          else if (id.startsWith('weather.')) debounced('wx', () => refreshWeather(cfg))
          else if (id.startsWith('counter.') || id.startsWith('input_number.'))
            debounced('rw', () => refreshRewards(cfg))
          else if (id === 'sun.sun') debounced('sun', refreshSun)
          else if (id.startsWith('person.')) debounced('persons', refreshPersons)
          else if (garbageEntities(cfg).includes(id)) debounced('garbage', () => refreshGarbage(cfg))
          else if (smartHomeEntities(cfg).includes(id) || extraRef.current.includes(id))
            debounced('ent', () => refreshEntities(cfg))
        } catch { /* ignore malformed frames */ }
      }
      ws.onclose = () => {
        if (alive) { setConnected(false); retry = setTimeout(connect, 5000) }
      }
    }
    connect()
    return () => {
      alive = false
      clearTimeout(retry)
      Object.values(timers).forEach(clearTimeout)
      ws?.close()
    }
  }, [refreshTodos, refreshEvents, refreshWeather, refreshRewards, refreshSun, refreshEntities, refreshPersons, refreshGarbage])

  // ----- actions -----
  const toggleItem = useCallback(async (entity: string, item: TodoItem) => {
    const status = item.status === 'completed' ? 'needs_action' : 'completed'
    setTodos((t) => ({
      ...t,
      [entity]: (t[entity] ?? []).map((i) => (i.uid === item.uid ? { ...i, status } : i)),
    }))
    try { await api.setTodoStatus(entity, item.uid, status) } catch { /* ws refresh will resync */ }
  }, [])

  const addItem = useCallback(async (entity: string, summary: string) => {
    await api.addTodoItem(entity, summary)
    if (refresher.current.cfg) refreshTodos(refresher.current.cfg)
  }, [refreshTodos])

  const removeItem = useCallback(async (entity: string, uid: string) => {
    setTodos((t) => ({ ...t, [entity]: (t[entity] ?? []).filter((i) => i.uid !== uid) }))
    try { await api.removeTodoItem(entity, uid) } catch { /* ws refresh will resync */ }
  }, [])

  const adjustReward = useCallback(async (entity: string, dir: 'increment' | 'decrement') => {
    await api.counterAdjust(entity, dir)
    if (refresher.current.cfg) refreshRewards(refresher.current.cfg)
  }, [refreshRewards])

  // re-fetch config after an editor save; the [config] effect re-runs refreshAll
  const reloadConfig = useCallback(async () => {
    const cfg = await api.getConfig()
    setConfig(cfg)
  }, [])

  // write the full config back to the server; optimistic, reverts on failure
  const saveConfig = useCallback(async (next: AppConfig): Promise<boolean> => {
    setConfig(next)
    try {
      await api.saveConfig(next)
      return true
    } catch {
      await reloadConfig()
      return false
    }
  }, [reloadConfig])

  const callService = useCallback(async (domain: string, service: string, data: Record<string, unknown>) => {
    // optimistic flip for light toggles so tiles feel instant
    const target = typeof data.entity_id === 'string' ? data.entity_id : undefined
    if (domain === 'light' && target && (service === 'turn_on' || service === 'turn_off')) {
      setEntityStates((s) => {
        const cur = s[target]
        return cur ? { ...s, [target]: { ...cur, state: service === 'turn_on' ? 'on' : 'off' } } : s
      })
    }
    try {
      await api.callService(domain, service, data)
    } finally {
      if (refresher.current.cfg) refreshEntities(refresher.current.cfg)
    }
  }, [refreshEntities])

  // garbage collections surface as colored all-day events in every calendar view
  const garbageEvents = useMemo<CalEvent[]>(() =>
    garbage.filter((g) => g.dayKey).map((g) => ({
      summary: g.name,
      start: `${g.dayKey}T00:00:00`,
      end: `${g.dayKey}T00:00:00`,
      allDay: true,
      calendar: 'garbage',
      color: g.color,
      dayKeys: [g.dayKey!],
      garbage: true,
    })), [garbage])
  const events = useMemo(() => [...calEvents, ...garbageEvents], [calEvents, garbageEvents])

  const value = useMemo<Store>(() => ({
    config, locale, language, t, now, todos, events, weather, forecast, rewardValues, photos,
    systemInfo, connected, themeMode, resolvedTheme, setThemeMode,
    monthCursor, setMonthCursor, selectedDate, setSelectedDate,
    toggleItem, addItem, removeItem, adjustReward, entityStates, callService, trackEntities, reloadConfig, saveConfig, persons, garbage,
  }), [config, locale, language, t, now, todos, events, weather, forecast, rewardValues, photos,
    systemInfo, connected, themeMode, resolvedTheme, setThemeMode,
    monthCursor, selectedDate, toggleItem, addItem, removeItem, adjustReward, entityStates, callService, trackEntities, reloadConfig, saveConfig, persons, garbage])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
