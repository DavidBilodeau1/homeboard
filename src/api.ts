import type { TodoItem, ForecastDay } from './types'

const json = async (r: Response) => {
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`)
  return r.json()
}

export const getConfig = () => fetch('/api/config').then(json)

export const saveConfig = (cfg: unknown) =>
  fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  }).then(json)

export const haGet = (path: string) => fetch(`/api/ha/${path}`).then(json)

export const haPost = (path: string, body: unknown) =>
  fetch(`/api/ha/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(json)

export const getState = (id: string) => haGet(`states/${id}`).catch(() => null)

export const getCalendarEvents = (entity: string, start: string, end: string) =>
  haGet(`calendars/${entity}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`).catch(() => [])

export const getTodoItems = async (entities: string[]): Promise<Record<string, { items: TodoItem[] }>> => {
  if (!entities.length) return {}
  try {
    const res = await haPost('services/todo/get_items?return_response', { entity_id: entities })
    return res.service_response ?? {}
  } catch {
    return {}
  }
}

export const getForecast = async (entity: string): Promise<ForecastDay[]> => {
  try {
    const res = await haPost('services/weather/get_forecasts?return_response', {
      entity_id: entity,
      type: 'daily',
    })
    return res.service_response?.[entity]?.forecast ?? []
  } catch {
    return []
  }
}

export const setTodoStatus = (entity: string, uid: string, status: 'needs_action' | 'completed') =>
  haPost('services/todo/update_item', { entity_id: entity, item: uid, status })

export const addTodoItem = (entity: string, item: string) =>
  haPost('services/todo/add_item', { entity_id: entity, item })

export const removeTodoItem = (entity: string, uid: string) =>
  haPost('services/todo/remove_item', { entity_id: entity, item: uid })

export const counterAdjust = (entity: string, dir: 'increment' | 'decrement') =>
  haPost(`services/counter/${dir}`, { entity_id: entity })

export const callService = (domain: string, service: string, data: Record<string, unknown>) =>
  haPost(`services/${domain}/${service}`, data)

/** Camera snapshot through the proxy; `bust` forces a fresh frame. */
export const cameraUrl = (entity: string, bust: number) =>
  `/api/ha/camera_proxy/${entity}?t=${bust}`

/** Mint an HLS playlist URL (proxied) for a camera's live stream. */
export const getCameraStream = (entity: string): Promise<{ url: string }> =>
  fetch(`/api/camera/${entity}/stream`).then(json)

export const getPhotos = (): Promise<string[]> => fetch('/api/photos').then(json).catch(() => [])
