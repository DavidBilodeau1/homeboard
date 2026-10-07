import { useEffect, useRef, useState } from 'react'

const RECONNECT_MS = 5000

interface Handlers {
  onStateChanged: (entityId: string) => void
  /** after an outage (server restart, tablet sleep, wifi blip) — not on the first connection */
  onReconnect: () => void
}

/** Listens to the server's `/ws` bridge of HA state changes; returns whether it is connected. */
export function useLiveUpdates(handlers: Handlers) {
  const [connected, setConnected] = useState(false)
  const latest = useRef(handlers)
  latest.current = handlers

  useEffect(() => {
    let socket: WebSocket | null = null
    let alive = true
    let everConnected = false
    let retry: ReturnType<typeof setTimeout>

    const connect = () => {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
      socket = new WebSocket(`${protocol}://${location.host}/ws`)
      socket.onopen = () => {
        setConnected(true)
        if (everConnected) latest.current.onReconnect()
        everConnected = true
      }
      socket.onmessage = (e) => {
        try {
          const message = JSON.parse(e.data)
          if (message.entity_id) latest.current.onStateChanged(message.entity_id)
        } catch { /* ignore malformed frames */ }
      }
      socket.onclose = () => {
        if (!alive) return
        setConnected(false)
        retry = setTimeout(connect, RECONNECT_MS)
      }
    }

    connect()
    return () => {
      alive = false
      clearTimeout(retry)
      socket?.close()
    }
  }, [])

  return connected
}
