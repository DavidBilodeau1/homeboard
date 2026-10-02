import type { AppConfig, EntityState, ForecastDay, ServerMeta, TodoItem } from './types'

/** Parses a JSON response, turning an error body's `error` into the thrown message. */
export async function readJson<T = any>(r: Response): Promise<T> {
  const body = await r.json().catch(() => null)
  if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status} ${r.statusText}`)
  return body
}

export const getJson = <T = any>(url: string): Promise<T> => fetch(url).then((r) => readJson<T>(r))

export const sendJson = <T = any>(url: string, body: unknown, method = 'POST'): Promise<T> =>
  fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => readJson<T>(r))

/** URL of a plugin's server route. */
export const pluginUrl = (pluginId: string, path: string) => `/api/plugins/${pluginId}/${path}`

export const getConfig = (): Promise<AppConfig> => getJson('/api/config')

export const saveConfig = (config: AppConfig) => sendJson('/api/config', config, 'PUT')

export const getMeta = (): Promise<ServerMeta> => getJson('/api/meta')

export const getPhotos = (): Promise<string[]> => getJson<string[]>('/api/photos').catch(() => [])

export const haGet = (path: string) => getJson(`/api/ha/${path}`)

const haPost = (path: string, body: unknown) => sendJson(`/api/ha/${path}`, body)

export const getState = (id: string): Promise<EntityState | null> => haGet(`states/${id}`).catch(() => null)

export const getAllStates = (): Promise<({ entity_id: string } & EntityState)[]> => haGet('states').catch(() => [])

export const getSystemInfo = (): Promise<{ location_name?: string; version?: string }> => haGet('config')

export const getCalendarEvents = (entity: string, start: string, end: string) =>
  haGet(`calendars/${entity}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`).catch(() => [])

export async function getTodoItems(entities: string[]): Promise<Record<string, { items: TodoItem[] }>> {
  if (!entities.length) return {}
  try {
    const res = await haPost('services/todo/get_items?return_response', { entity_id: entities })
    return res.service_response ?? {}
  } catch {
    return {}
  }
}

export async function getForecast(entity: string): Promise<ForecastDay[]> {
  try {
    const res = await haPost('services/weather/get_forecasts?return_response', { entity_id: entity, type: 'daily' })
    return res.service_response?.[entity]?.forecast ?? []
  } catch {
    return []
  }
}

export const callService = (domain: string, service: string, data: Record<string, unknown>) =>
  haPost(`services/${domain}/${service}`, data)

export const setTodoStatus = (entity: string, uid: string, status: TodoItem['status']) =>
  callService('todo', 'update_item', { entity_id: entity, item: uid, status })

export const addTodoItem = (entity: string, item: string) => callService('todo', 'add_item', { entity_id: entity, item })

export const removeTodoItem = (entity: string, uid: string) => callService('todo', 'remove_item', { entity_id: entity, item: uid })

export const adjustCounter = (entity: string, direction: 'increment' | 'decrement') =>
  callService('counter', direction, { entity_id: entity })
