import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Frigate NVR client. Everything is served by HomeBoard's own /api/frigate
 * proxy (see server/frigate.js) — the browser never sees the Frigate host or
 * its credentials.
 */

export interface FrigateCamera {
  name: string
  label: string
  width: number | null
  height: number | null
  snapshots: boolean
  recording: boolean
  audio: boolean
  zones: string[]
  objects: string[]
}

export type Severity = 'alert' | 'detection' | string

export interface FrigateAlert {
  id: string
  camera: string
  severity: Severity
  start: number | null
  end: number | null
  reviewed: boolean
  objects: string[]
  subLabels: string[]
  zones: string[]
  audio: string[]
  /** event ids that make up this segment — the first one gives us a still */
  detections: string[]
}

export interface FrigateObject {
  id: string
  camera: string
  label: string
  subLabel: string | null
  score: number | null
  start: number | null
  end: number | null
  zones: string[]
  hasClip: boolean
  hasSnapshot: boolean
  speed: number | null
  plate: string | null
}

export interface CameraHealth {
  fps: number | null
  detectionFps: number | null
  skippedFps: number | null
  online: boolean | null
  audioRms: number | null
  audioDbfs: number | null
}

export interface FrigateHealth {
  version: string | null
  latestVersion: string | null
  uptime: number | null
  detectors: { name: string; inferenceSpeed: number | null }[]
  gpus: { name: string; usage: string | null; mem: string | null }[]
  storage: { mount: string; usedPct: number | null; usedGb: number | null; totalGb: number | null } | null
  cameras: Record<string, CameraHealth>
}

export interface FrigateState {
  enabled: boolean
  mock?: boolean
  cameras: FrigateCamera[]
  alerts: FrigateAlert[]
  objects: FrigateObject[]
  health?: FrigateHealth
  summary?: { alerts24h: number | null; detections24h: number | null; unreviewed: number }
  at?: number
  error?: string
  /** parts of the payload Frigate refused, so a gap can't pass for "quiet" */
  warnings?: string[]
}

// ---------- media URLs ----------
const media = (p: string) => `/api/frigate/media/${p}`

/**
 * Freshest decoded frame. `bust` forces the browser to actually re-fetch.
 *
 * The resize parameter is `height` — Frigate's old `h` was dropped when the API
 * moved to FastAPI, and an unknown parameter is ignored rather than refused, so
 * every tile was quietly pulling a full-resolution frame every few seconds.
 */
export const snapshotUrl = (camera: string, bust: number, height = 480) =>
  media(`${camera}/latest.jpg?height=${height}&t=${bust}`)

/** Live MJPEG feed, with Frigate's own detection overlays burnt in. */
export const liveUrl = (camera: string, fps = 5, height = 720) =>
  media(`${camera}?fps=${fps}&height=${height}&bbox=1&timestamp=1&zones=1`)

export const eventThumbUrl = (id: string) => media(`events/${id}/thumbnail.jpg`)
export const eventSnapshotUrl = (id: string, height = 720) =>
  media(`events/${id}/snapshot.jpg?bbox=1&height=${height}`)
export const eventClipUrl = (id: string) => media(`events/${id}/clip.mp4`)
export const eventGifUrl = (id: string) => media(`events/${id}/preview.gif`)
export const reviewPreviewUrl = (id: string) => media(`review/${id}/preview?format=gif`)
export const reviewClipUrl = (id: string) => media(`review/${id}/clip.mp4?padding=2`)

/** Timelapse of a window on one camera — Frigate's `preview.mp4` endpoint. */
export const recapUrl = (camera: string, startTs: number, endTs: number) =>
  media(`${camera}/start/${Math.floor(startTs)}/end/${Math.floor(endTs)}/preview.mp4`)

// ---------- data ----------
const json = async (r: Response) => {
  const body = await r.json().catch(() => null)
  if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`)
  return body
}

export const getFrigateState = (): Promise<FrigateState> => fetch('/api/frigate/state').then(json)

export const getMotion = (camera: string, minutes = 60): Promise<{ points: number[] }> =>
  fetch(`/api/frigate/motion?camera=${encodeURIComponent(camera)}&minutes=${minutes}`).then(json)

export const markReviewed = (ids: string[]): Promise<{ ok: boolean }> =>
  fetch('/api/frigate/reviewed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  }).then(json)

/**
 * Polls the aggregated state. One request keeps cameras, alerts, detections and
 * health in sync; snapshots refresh on their own faster cadence in the tiles.
 */
export function useFrigate(intervalMs = 15_000) {
  const [state, setState] = useState<FrigateState | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A failed poll keeps the last payload on screen — which looks exactly like a
  // quiet house. Remember when it last landed, and when we last tried, so the
  // page can say otherwise. `polledAt` also guarantees a render per attempt:
  // re-setting the same error string alone would not cause one.
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [polledAt, setPolledAt] = useState(0)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const s = await getFrigateState()
      if (!alive.current) return
      setState(s)
      setError(s.error ?? s.warnings?.[0] ?? null)
      setFetchedAt(Date.now())
    } catch (e) {
      if (alive.current) setError((e as Error).message)
    } finally {
      if (alive.current) setPolledAt(Date.now())
    }
  }, [])

  useEffect(() => {
    alive.current = true
    refresh()
    const t = setInterval(refresh, intervalMs)
    // a wall panel that slept for hours should catch up the moment it wakes
    const onVisible = () => { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive.current = false
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh, intervalMs])

  const review = useCallback(async (ids: string[]) => {
    setState((s) => (s ? { ...s, alerts: s.alerts.map((a) => (ids.includes(a.id) ? { ...a, reviewed: true } : a)) } : s))
    try { await markReviewed(ids) } catch { /* the next poll resyncs */ }
    refresh()
  }, [refresh])

  // two missed polls in a row: enough that a wall panel shouldn't be trusted
  const stale = fetchedAt != null && polledAt - fetchedAt > intervalMs * 2.5

  return { state, error, refresh, review, fetchedAt, stale }
}

// ---------- formatting ----------
/** "3 min", "2 h 10", "just now" — compact enough for a badge. */
export const timeAgo = (ts: number | null | undefined, locale = 'en'): string => {
  if (!ts) return '—'
  const secs = Math.max(0, Date.now() / 1000 - ts)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' })
  if (secs < 60) return rtf.format(-Math.round(secs), 'second')
  if (secs < 3600) return rtf.format(-Math.round(secs / 60), 'minute')
  if (secs < 86_400) return rtf.format(-Math.round(secs / 3600), 'hour')
  return rtf.format(-Math.round(secs / 86_400), 'day')
}

export const clockTime = (ts: number | null | undefined, locale = 'en'): string =>
  ts ? new Date(ts * 1000).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '—'

export const duration = (secs: number | null | undefined): string => {
  if (!secs || secs < 0) return '—'
  const d = Math.floor(secs / 86_400)
  const h = Math.floor((secs % 86_400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  return `${m}m`
}
