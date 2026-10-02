import { WebSocketServer, WebSocket } from 'ws'

/** Domains the core dashboard always shows, so their changes always reach browsers. */
const CORE_DOMAINS = new Set(['todo', 'calendar', 'weather', 'counter', 'input_number', 'person', 'sun'])
const ENTITY_ID = /^[a-z_]+\.[a-z0-9_]+$/

/** Every string in `value` that looks like an entity id. */
export function entityIdsIn(value, found = new Set()) {
  if (typeof value === 'string' && ENTITY_ID.test(value)) found.add(value)
  else if (Array.isArray(value)) value.forEach((item) => entityIdsIn(item, found))
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => entityIdsIn(item, found))
  return found
}

/** Whether a state change concerns the dashboard: a core domain or an entity named in the config. */
export function createEntityFilter(configStore) {
  let configured = new Set()
  const rebuild = () => {
    const config = configStore.tryRead()
    if (config) configured = entityIdsIn(config)
  }
  rebuild()
  configStore.onChange(rebuild)
  return (entityId) => CORE_DOMAINS.has(entityId.split('.')[0]) || configured.has(entityId)
}

/** The `/ws` endpoint browsers listen on for `state_changed` notifications. */
export function createLiveUpdates(server, { isAuthorized }) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient: (info, done) => done(isAuthorized(info.req), 401, 'Unauthorized'),
  })

  const broadcast = (entityId) => {
    const message = JSON.stringify({ type: 'state_changed', entity_id: entityId })
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(message)
    }
  }

  return { broadcast }
}
