import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from '../api'
import { normalizeEvents } from '../events'
import type { AppConfig, CalEvent, ForecastDay, PersonState, TodoItem, WeatherState } from '../types'
import { addDays, monthGrid } from '../util'

const todoEntities = (config: AppConfig) =>
  [...new Set([...config.tasks ?? [], ...config.meals ?? [], ...config.lists ?? []]
    .map((list) => list.entity)
    .filter((entity): entity is string => !!entity))]

const numberOrNull = (value: unknown) => {
  const n = Number(value)
  return value != null && Number.isFinite(n) ? n : null
}

/** The core dashboard data read from Home Assistant: todos, calendars, weather, rewards, people. */
export function useHomeAssistantData(config: AppConfig | null, monthCursor: Date) {
  const [todos, setTodos] = useState<Record<string, TodoItem[]>>({})
  const [calendarEvents, setCalendarEvents] = useState<CalEvent[]>([])
  const [weather, setWeather] = useState<WeatherState | null>(null)
  const [forecast, setForecast] = useState<ForecastDay[]>([])
  const [rewardValues, setRewardValues] = useState<Record<string, number | null>>({})
  const [persons, setPersons] = useState<PersonState[]>([])
  const latest = useRef({ config, monthCursor })
  latest.current = { config, monthCursor }

  const refreshTodos = useCallback(async () => {
    const { config } = latest.current
    if (!config) return
    const entities = todoEntities(config)
    const results = await api.getTodoItems(entities)
    setTodos(Object.fromEntries(entities.map((id) => [id, results[id]?.items ?? []])))
  }, [])

  const refreshEvents = useCallback(async () => {
    const { config, monthCursor } = latest.current
    if (!config) return
    const grid = monthGrid(monthCursor)
    const start = grid[0].toISOString()
    const end = addDays(grid[grid.length - 1], 1).toISOString()
    const perCalendar = await Promise.all((config.calendars ?? []).map(async (calendar) =>
      normalizeEvents(await api.getCalendarEvents(calendar.entity, start, end), calendar.entity, calendar.color)))
    setCalendarEvents(perCalendar.flat())
  }, [])

  const refreshWeather = useCallback(async () => {
    const entity = latest.current.config?.weatherEntity
    if (!entity) return
    const [state, days] = await Promise.all([api.getState(entity), api.getForecast(entity)])
    if (state) {
      setWeather({
        state: state.state,
        temperature: numberOrNull(state.attributes.temperature),
        unit: String(state.attributes.temperature_unit ?? '°'),
      })
    }
    setForecast(days)
  }, [])

  const refreshRewards = useCallback(async () => {
    const entities = (latest.current.config?.rewards ?? []).map((r) => r.entity).filter((e): e is string => !!e)
    const states = await Promise.all(entities.map(api.getState))
    setRewardValues(Object.fromEntries(entities.map((id, i) => [id, numberOrNull(states[i]?.state)])))
  }, [])

  const refreshPersons = useCallback(async () => {
    const all = await api.getAllStates()
    setPersons(all
      .filter((s) => s.entity_id.startsWith('person.'))
      .map((s) => ({ entity: s.entity_id, name: String(s.attributes.friendly_name ?? s.entity_id), state: s.state })))
  }, [])

  const refreshersByDomain = useMemo<Record<string, () => void>>(() => ({
    todo: refreshTodos,
    calendar: refreshEvents,
    weather: refreshWeather,
    counter: refreshRewards,
    input_number: refreshRewards,
    person: refreshPersons,
  }), [refreshTodos, refreshEvents, refreshWeather, refreshRewards, refreshPersons])

  const refreshAll = useCallback(() => {
    new Set(Object.values(refreshersByDomain)).forEach((refresh) => refresh())
  }, [refreshersByDomain])

  useEffect(() => { if (config) refreshAll() }, [config, refreshAll])
  useEffect(() => { refreshEvents() }, [monthCursor, refreshEvents])

  const toggleItem = useCallback(async (entity: string, item: TodoItem) => {
    const status = item.status === 'completed' ? 'needs_action' : 'completed'
    setTodos((prev) => ({ ...prev, [entity]: (prev[entity] ?? []).map((i) => (i.uid === item.uid ? { ...i, status } : i)) }))
    try { await api.setTodoStatus(entity, item.uid, status) } catch { /* the next refresh resyncs */ }
  }, [])

  const addItem = useCallback(async (entity: string, summary: string) => {
    await api.addTodoItem(entity, summary)
    refreshTodos()
  }, [refreshTodos])

  const removeItem = useCallback(async (entity: string, uid: string) => {
    setTodos((prev) => ({ ...prev, [entity]: (prev[entity] ?? []).filter((i) => i.uid !== uid) }))
    try { await api.removeTodoItem(entity, uid) } catch { /* the next refresh resyncs */ }
  }, [])

  const adjustReward = useCallback(async (entity: string, direction: 'increment' | 'decrement') => {
    await api.adjustCounter(entity, direction)
    refreshRewards()
  }, [refreshRewards])

  return {
    todos, calendarEvents, weather, forecast, rewardValues, persons,
    refreshersByDomain, refreshAll,
    toggleItem, addItem, removeItem, adjustReward,
  }
}
