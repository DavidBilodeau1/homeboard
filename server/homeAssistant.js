import { WebSocket } from 'ws'

const RECONNECT_MS = 5000
const KEEPALIVE_MS = 30_000

/** Forwards `/api/ha/*` to HA's REST API with the server-held token. */
export function haProxy({ url, token }) {
  return async (req, res) => {
    const init = {
      method: req.method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    }
    if (!['GET', 'HEAD'].includes(req.method)) init.body = JSON.stringify(req.body ?? {})
    try {
      const r = await fetch(`${url}/api${req.url}`, init)
      // buffered rather than as text so binary bodies (camera_proxy JPEGs) survive
      const body = Buffer.from(await r.arrayBuffer())
      res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(body)
    } catch (e) {
      res.status(502).json({ error: `HA proxy error: ${e.message}` })
    }
  }
}

/** Calls `onStateChanged(entityId)` for every HA state change; reconnects forever. */
export function subscribeToStateChanges({ url, token }, onStateChanged) {
  const connect = () => {
    const ha = new WebSocket(`${url.replace(/^http/, 'ws')}/api/websocket`)
    let nextId = 1
    let keepalive = null
    const send = (message) => ha.send(JSON.stringify({ id: nextId++, ...message }))

    const handlers = {
      auth_required: () => ha.send(JSON.stringify({ type: 'auth', access_token: token })),
      auth_ok: () => {
        console.log('[homeboard] HA websocket connected')
        send({ type: 'subscribe_events', event_type: 'state_changed' })
        // reverse proxies drop idle websockets
        keepalive = setInterval(() => ha.readyState === WebSocket.OPEN && send({ type: 'ping' }), KEEPALIVE_MS)
      },
      auth_invalid: () => {
        console.error('[homeboard] HA websocket auth failed — check HA_TOKEN')
        ha.close()
      },
      event: (message) => onStateChanged(message.event?.data?.entity_id ?? ''),
    }

    ha.on('message', (data) => {
      let message
      try { message = JSON.parse(data.toString()) } catch { return }
      handlers[message.type]?.(message)
    })
    ha.on('close', () => {
      clearInterval(keepalive)
      console.warn(`[homeboard] HA websocket closed, reconnecting in ${RECONNECT_MS / 1000}s`)
      setTimeout(connect, RECONNECT_MS)
    })
    ha.on('error', (e) => {
      console.warn(`[homeboard] HA websocket error: ${e.code ?? e.message ?? e}`)
      ha.terminate()
    })
  }
  connect()
}
