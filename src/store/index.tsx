import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as api from '../api'
import { makeT, resolveLanguage, withMessages, type MessageBundle, type Translate } from '../i18n'
import type { AppConfig, CalEvent, EntityState, ForecastDay, PersonState, PluginSettings, ServerMeta, ThemeMode, TodoItem, WeatherState } from '../types'
import { startOfMonth } from '../util'
import { useCalendarLayers } from './useCalendarLayers'
import { useDebouncer } from './useDebouncer'
import { useEntityRegistry, type EntityStates } from './useEntityRegistry'
import { useHomeAssistantData } from './useHomeAssistantData'
import { useLiveUpdates } from './useLiveUpdates'
import { useTheme } from './useTheme'

const CLOCK_TICK_MS = 10_000
const FALLBACK_REFRESH_MS = 5 * 60_000
const LIVE_UPDATE_DEBOUNCE_MS = 400
const SUN = 'sun.sun'

interface SystemInfo {
  location_name?: string
  version?: string
}

interface Store {
  config: AppConfig | null
  meta: ServerMeta | null
  locale: string
  language: string
  t: Translate
  now: Date
  connected: boolean
  systemInfo: SystemInfo | null
  todos: Record<string, TodoItem[]>
  /** HA calendar events plus every plugin event source, minus layers hidden on this screen */
  events: CalEvent[]
  weather: WeatherState | null
  forecast: ForecastDay[]
  rewardValues: Record<string, number | null>
  photos: string[]
  persons: PersonState[]
  themeMode: ThemeMode
  resolvedTheme: 'light' | 'dark'
  setThemeMode: (mode: ThemeMode) => void
  monthCursor: Date
  setMonthCursor: (d: Date) => void
  selectedDate: Date
  setSelectedDate: (d: Date) => void
  toggleItem: (entity: string, item: TodoItem) => Promise<void>
  addItem: (entity: string, summary: string) => Promise<void>
  removeItem: (entity: string, uid: string) => Promise<void>
  adjustReward: (entity: string, direction: 'increment' | 'decrement') => Promise<void>
  entityStates: EntityStates
  /** keeps entities live until the returned release is called */
  trackEntities: (ids: string[]) => () => void
  callService: (domain: string, service: string, data: Record<string, unknown>) => Promise<void>
  reloadConfig: () => Promise<void>
  /** writes the whole config; optimistic, reverts when the server refuses */
  saveConfig: (next: AppConfig) => Promise<boolean>
  savePluginSettings: (id: string, settings: PluginSettings) => Promise<boolean>
  layerVisible: (id: string, fallback?: boolean) => boolean
  toggleLayer: (id: string, fallback?: boolean) => void
  setEventSource: (source: string, events: CalEvent[]) => void
}

const Ctx = createContext<Store | null>(null)

export const useStore = () => {
  const store = useContext(Ctx)
  if (!store) throw new Error('useStore must be used inside DashboardProvider')
  return store
}

/** Keeps the given entities live while the calling component is mounted. */
export function useTrackedEntities(ids: (string | null | undefined)[]): EntityStates {
  const { entityStates, trackEntities } = useStore()
  const key = ids.filter(Boolean).join(',')
  useEffect(() => trackEntities(key ? key.split(',') : []), [key, trackEntities])
  return entityStates
}

/** `undefined` while loading, `null` when HA does not know the entity. */
export function useEntityState(id: string | null | undefined): EntityState | null | undefined {
  return useTrackedEntities([id])[id ?? '']
}

/** Adds a plugin's events to every calendar view while the calling component is mounted. */
export function useCalendarEventSource(source: string, events: CalEvent[]) {
  const { setEventSource } = useStore()
  useEffect(() => setEventSource(source, events), [source, events, setEventSource])
  useEffect(() => () => setEventSource(source, []), [source, setEventSource])
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CLOCK_TICK_MS)
    return () => clearInterval(timer)
  }, [])
  return now
}

function useEventSources() {
  const [sources, setSources] = useState<Record<string, CalEvent[]>>({})
  const setEventSource = useCallback((source: string, events: CalEvent[]) => {
    setSources((prev) => (prev[source] === events ? prev : { ...prev, [source]: events }))
  }, [])
  const sourceEvents = useMemo(() => Object.values(sources).flat(), [sources])
  return { sourceEvents, setEventSource }
}

const domainOf = (entityId: string) => entityId.split('.')[0]

export function DashboardProvider({ messages, children }: { messages: MessageBundle[]; children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [meta, setMeta] = useState<ServerMeta | null>(null)
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const configRef = useRef(config)
  configRef.current = config

  const now = useClock()
  const locale = config?.locale || navigator.language
  const language = resolveLanguage(config?.language, locale)
  const bundle = useMemo(() => withMessages(messages), [messages])
  const t = useMemo(() => makeT(language, bundle), [language, bundle])

  const registry = useEntityRegistry()
  const ha = useHomeAssistantData(config, monthCursor)
  const { layerVisible, toggleLayer } = useCalendarLayers()
  const { sourceEvents, setEventSource } = useEventSources()
  const { themeMode, resolvedTheme, setThemeMode } = useTheme(config?.theme, registry.states[SUN]?.state === 'below_horizon')
  const debounce = useDebouncer(LIVE_UPDATE_DEBOUNCE_MS)

  const reloadConfig = useCallback(async () => setConfig(await api.getConfig()), [])

  useEffect(() => {
    reloadConfig().catch(() => setConfig(null))
    api.getMeta().then(setMeta).catch(() => {})
    api.getPhotos().then(setPhotos)
    api.getSystemInfo().then(setSystemInfo).catch(() => {})
  }, [reloadConfig])

  const { track, refreshAll: refreshEntities } = registry
  useEffect(() => track([SUN]), [track])

  const { refreshAll: refreshHomeData } = ha
  const refreshEverything = useCallback(() => {
    refreshHomeData()
    refreshEntities()
  }, [refreshHomeData, refreshEntities])

  useEffect(() => {
    const timer = setInterval(refreshEverything, FALLBACK_REFRESH_MS)
    return () => clearInterval(timer)
  }, [refreshEverything])

  const onStateChanged = (entityId: string) => {
    if (registry.isTracked(entityId)) debounce(entityId, () => registry.refresh([entityId]))
    const domain = domainOf(entityId)
    const refreshDomain = ha.refreshersByDomain[domain]
    if (refreshDomain) debounce(domain, refreshDomain)
  }
  const connected = useLiveUpdates({ onStateChanged, onReconnect: refreshEverything })

  const saveConfig = useCallback(async (next: AppConfig) => {
    setConfig(next)
    try {
      await api.saveConfig(next)
      return true
    } catch {
      await reloadConfig()
      return false
    }
  }, [reloadConfig])

  const savePluginSettings = useCallback((id: string, settings: PluginSettings) => {
    const current = configRef.current ?? {}
    return saveConfig({ ...current, plugins: { ...current.plugins, [id]: settings } })
  }, [saveConfig])

  const { refresh: refreshStates, setOptimistic } = registry
  const callService = useCallback(async (domain: string, service: string, data: Record<string, unknown>) => {
    const targets = [data.entity_id].flat().filter((id): id is string => typeof id === 'string')
    if (domain === 'light' && (service === 'turn_on' || service === 'turn_off')) {
      targets.forEach((id) => setOptimistic(id, service === 'turn_on' ? 'on' : 'off'))
    }
    try {
      await api.callService(domain, service, data)
    } finally {
      refreshStates(targets)
    }
  }, [refreshStates, setOptimistic])

  const events = useMemo(
    () => [...ha.calendarEvents, ...sourceEvents]
      .filter((e) => layerVisible(e.calendar))
      .sort((a, b) => a.start.localeCompare(b.start)),
    [ha.calendarEvents, sourceEvents, layerVisible],
  )

  const value = useMemo<Store>(() => ({
    config, meta, locale, language, t, now, connected, systemInfo, photos, events,
    todos: ha.todos,
    weather: ha.weather,
    forecast: ha.forecast,
    rewardValues: ha.rewardValues,
    persons: ha.persons,
    toggleItem: ha.toggleItem,
    addItem: ha.addItem,
    removeItem: ha.removeItem,
    adjustReward: ha.adjustReward,
    themeMode, resolvedTheme, setThemeMode,
    monthCursor, setMonthCursor, selectedDate, setSelectedDate,
    entityStates: registry.states,
    trackEntities: track,
    callService, reloadConfig, saveConfig, savePluginSettings,
    layerVisible, toggleLayer, setEventSource,
  }), [config, meta, locale, language, t, now, connected, systemInfo, photos, events, ha.todos, ha.weather, ha.forecast,
    ha.rewardValues, ha.persons, ha.toggleItem, ha.addItem, ha.removeItem, ha.adjustReward, themeMode, resolvedTheme,
    setThemeMode, monthCursor, selectedDate, registry.states, track, callService, reloadConfig, saveConfig,
    savePluginSettings, layerVisible, toggleLayer, setEventSource])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
