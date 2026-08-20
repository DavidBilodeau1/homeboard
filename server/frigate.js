import express from 'express'
import { Readable } from 'stream'
import { frigateMockRouter } from './frigateMock.js'

/**
 * Frigate NVR integration.
 *
 * HomeBoard never lets the browser talk to Frigate directly: everything goes
 * through this router so the Frigate URL and credentials stay server-side.
 *
 *   GET  /api/frigate/state          one aggregated payload (cameras + alerts +
 *                                    recent objects + system health)
 *   GET  /api/frigate/motion         motion-activity series for one camera
 *   GET  /api/frigate/media/*        allow-listed image/video passthrough
 *   POST /api/frigate/reviewed       mark review items as reviewed
 *
 * Frigate API reference: https://docs.frigate.video/integrations/api/
 */

const FRIGATE_URL = (process.env.FRIGATE_URL || '').replace(/\/+$/, '').replace(/\/api$/, '')
const FRIGATE_USER = process.env.FRIGATE_USER || ''
const FRIGATE_PASSWORD = process.env.FRIGATE_PASSWORD || ''
// A JWT lifted from a browser session works too; otherwise we log in ourselves.
const FRIGATE_TOKEN = process.env.FRIGATE_TOKEN || ''

export const FRIGATE_ENABLED = Boolean(FRIGATE_URL)
export const frigateTarget = FRIGATE_URL

// ---------- auth ----------
// Frigate accepts its JWT either as the `frigate_token` cookie or as a bearer
// token. When auth is disabled (typical on a trusted LAN) we send neither.
let token = FRIGATE_TOKEN || null

async function login() {
  if (!FRIGATE_USER || !FRIGATE_PASSWORD) return null
  const r = await fetch(`${FRIGATE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: FRIGATE_USER, password: FRIGATE_PASSWORD }),
    redirect: 'manual',
  })
  if (!r.ok && r.status !== 302) throw new Error(`Frigate login failed: HTTP ${r.status}`)
  // the JWT comes back as a Set-Cookie; its name is configurable, so take the
  // first cookie that looks like a token
  const raw = r.headers.getSetCookie?.().join(',') ?? r.headers.get('set-cookie') ?? ''
  const m = /(?:^|[;,\s])([a-z_]*token[a-z_]*)=([^;,\s]+)/i.exec(raw)
  token = m?.[2] ?? null
  if (!token) throw new Error('Frigate login returned no token cookie')
  return token
}

/** Fetch a Frigate API path, logging in again once if the token went stale. */
async function fapi(path, init = {}, retried = false) {
  const headers = { ...(init.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  const r = await fetch(`${FRIGATE_URL}/api${path}`, { ...init, headers, redirect: 'manual' })
  const rejected = r.status === 401 || r.status === 403 || (r.status === 302 && !init.stream)
  if (rejected && !retried && FRIGATE_USER) {
    await login()
    return fapi(path, init, true)
  }
  return r
}

async function fjson(path) {
  const r = await fapi(path)
  if (!r.ok) throw new Error(`Frigate ${path}: HTTP ${r.status}`)
  return r.json()
}

// ---------- normalisation ----------
/** Frigate hands out epoch seconds in most places but ISO strings in a few. */
const secs = (v) => {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v) {
    const t = Date.parse(v)
    if (Number.isFinite(t)) return t / 1000
  }
  return null
}
const uniq = (a) => [...new Set((a ?? []).filter(Boolean))]
const mb2gb = (v) => (typeof v === 'number' ? Math.round((v / 1024) * 10) / 10 : null)

/** Camera list straight from Frigate's own config — no duplication in ours. */
let camCache = { at: 0, cams: [], version: null }
async function discover() {
  if (Date.now() - camCache.at < 60_000 && camCache.cams.length) return camCache
  const [cfg, version] = await Promise.all([
    fjson('/config'),
    fjson('/version').catch(() => null),
  ])
  const cams = Object.entries(cfg?.cameras ?? {})
    .filter(([, c]) => c?.enabled !== false)
    .map(([name, c]) => ({
      name,
      label: c?.friendly_name || name.replace(/_/g, ' ').replace(/\b\w/g, (s) => s.toUpperCase()),
      width: c?.detect?.width ?? null,
      height: c?.detect?.height ?? null,
      // a camera with no snapshots still has a live feed, so keep both flags
      snapshots: c?.snapshots?.enabled !== false,
      recording: c?.record?.enabled === true,
      audio: c?.audio?.enabled === true,
      zones: Object.keys(c?.zones ?? {}),
      objects: c?.objects?.track ?? cfg?.objects?.track ?? [],
      birdseyeOrder: c?.birdseye?.order ?? 0,
    }))
    .sort((a, b) => a.birdseyeOrder - b.birdseyeOrder || a.name.localeCompare(b.name))
  camCache = { at: Date.now(), cams, version: typeof version === 'string' ? version : version?.version ?? null }
  return camCache
}

/** Per-camera runtime numbers out of /stats, plus service-wide health. */
function health(stats, cams, version) {
  const svc = stats?.service ?? {}
  const storages = Object.entries(svc.storage ?? {}).map(([mount, s]) => ({
    mount,
    usedPct: s?.total ? Math.round((s.used / s.total) * 100) : null,
    usedGb: mb2gb(s?.used),
    totalGb: mb2gb(s?.total),
  }))
  // the recordings mount is the one that actually fills up
  storages.sort((a, b) => Number(b.mount.includes('recordings')) - Number(a.mount.includes('recordings')))

  return {
    version: version ?? svc.version ?? null,
    latestVersion: svc.latest_version ?? null,
    uptime: svc.uptime ?? null,
    detectors: Object.entries(stats?.detectors ?? {}).map(([name, d]) => ({
      name,
      inferenceSpeed: d?.inference_speed ?? null,
    })),
    gpus: Object.entries(stats?.gpu_usages ?? {}).map(([name, g]) => ({
      name,
      usage: g?.gpu ?? null,
      mem: g?.mem ?? null,
    })),
    storage: storages[0] ?? null,
    cameras: Object.fromEntries(cams.map((c) => {
      const s = stats?.cameras?.[c.name] ?? {}
      const fps = s.camera_fps ?? null
      return [c.name, {
        fps,
        detectionFps: s.detection_fps ?? null,
        skippedFps: s.skipped_fps ?? null,
        // Frigate zeroes camera_fps when the ffmpeg process can't reach the camera
        online: fps == null ? null : fps > 0,
        audioRms: s.audio_rms ?? null,
        audioDbfs: s.audio_dBFS ?? null,
      }]
    })),
  }
}

export function frigateRouter() {
  const r = express.Router()

  r.get('/state', async (req, res) => {
    res.set('Cache-Control', 'no-store')
    const alertLimit = Math.min(Number(req.query.alerts) || 20, 100)
    const eventLimit = Math.min(Number(req.query.events) || 24, 100)
    try {
      const { cams, version } = await discover()
      const [review, events, stats, summary] = await Promise.all([
        // reviewed=1 means "don't filter out the ones already seen"
        fjson(`/review?limit=${alertLimit}&reviewed=1`).catch(() => []),
        fjson(`/events?limit=${eventLimit}&has_snapshot=1`).catch(() => []),
        fjson('/stats').catch(() => null),
        fjson('/review/summary').catch(() => null),
      ])

      const alerts = (Array.isArray(review) ? review : []).map((v) => ({
        id: v.id,
        camera: v.camera,
        severity: v.severity,
        start: secs(v.start_time),
        end: secs(v.end_time),
        reviewed: !!v.has_been_reviewed,
        objects: uniq(v.data?.objects),
        subLabels: uniq(v.data?.sub_labels),
        zones: uniq(v.data?.zones),
        audio: uniq(v.data?.audio),
        // the still we show comes from the first detection in the segment
        detections: v.data?.detections ?? [],
      }))

      const objects = (Array.isArray(events) ? events : []).map((e) => ({
        id: e.id,
        camera: e.camera,
        label: e.label,
        subLabel: e.sub_label ?? null,
        score: e.data?.top_score ?? e.top_score ?? e.data?.score ?? null,
        start: secs(e.start_time),
        end: secs(e.end_time),
        zones: uniq(e.zones),
        hasClip: !!e.has_clip,
        hasSnapshot: !!e.has_snapshot,
        speed: e.data?.average_estimated_speed || null,
        plate: e.data?.recognized_license_plate ?? null,
      }))

      const last24 = summary?.last24Hours ?? {}
      res.json({
        enabled: true,
        cameras: cams,
        alerts,
        objects,
        health: health(stats, cams, version),
        summary: {
          alerts24h: last24.total_alert ?? null,
          detections24h: last24.total_detection ?? null,
          unreviewed: alerts.filter((a) => !a.reviewed && a.severity === 'alert').length,
        },
        at: Date.now(),
      })
    } catch (e) {
      res.status(502).json({ enabled: true, error: `Frigate unreachable: ${e.message}` })
    }
  })

  // motion activity for one camera, bucketed — drives the tile sparklines
  r.get('/motion', async (req, res) => {
    const camera = String(req.query.camera || '')
    if (!/^[a-zA-Z0-9_-]+$/.test(camera)) return res.status(400).json({ error: 'invalid camera' })
    const minutes = Math.min(Math.max(Number(req.query.minutes) || 60, 5), 24 * 60)
    const before = Math.floor(Date.now() / 1000)
    const after = before - minutes * 60
    const scale = Math.max(Math.round((minutes * 60) / 60), 15) // ~60 buckets
    try {
      const rows = await fjson(
        `/review/activity/motion?cameras=${encodeURIComponent(camera)}&after=${after}&before=${before}&scale=${scale}`,
      )
      res.set('Cache-Control', 'no-store')
      res.json({
        camera,
        after,
        before,
        points: (Array.isArray(rows) ? rows : []).map((p) => Math.max(0, Number(p.motion) || 0)),
      })
    } catch (e) {
      res.status(502).json({ error: e.message })
    }
  })

  r.post('/reviewed', async (req, res) => {
    const ids = (req.body?.ids ?? []).filter((id) => typeof id === 'string')
    if (!ids.length) return res.status(400).json({ error: 'ids required' })
    try {
      const r2 = await fapi('/reviews/viewed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, reviewed: true }),
      })
      if (!r2.ok) return res.status(r2.status).json({ error: `Frigate returned HTTP ${r2.status}` })
      res.json({ ok: true, count: ids.length })
    } catch (e) {
      res.status(502).json({ error: e.message })
    }
  })

  // ---------- media passthrough ----------
  // Only these shapes are proxied, so the route can't be used to reach the
  // config, the users API or anything else on the Frigate host.
  const CAM = '[a-zA-Z0-9_-]+'
  const ID = '[a-zA-Z0-9._-]+'
  const TS = '[0-9.]+'
  const MEDIA_ALLOW = [
    new RegExp(`^${CAM}$`),                                             // live MJPEG feed
    new RegExp(`^${CAM}/latest\\.(jpg|png|webp)$`),                     // freshest frame
    new RegExp(`^${CAM}/start/${TS}/end/${TS}/preview\\.(mp4|gif)$`),   // timelapse recap
    new RegExp(`^${CAM}/recordings/${TS}/snapshot\\.(jpg|png)$`),       // frame at a moment
    new RegExp(`^events/${ID}/(snapshot|thumbnail)\\.(jpg|png|webp)$`),
    new RegExp(`^events/${ID}/(clip\\.mp4|preview\\.gif)$`),
    new RegExp(`^review/${ID}/(clip\\.mp4|preview)$`),
  ]
  const MEDIA_PARAMS = new Set([
    'h', 'height', 'quality', 'bbox', 'timestamp', 'zones', 'mask', 'motion',
    'regions', 'paths', 'fps', 'format', 'padding', 'crop', 'max_cache_age',
  ])

  r.get(/^\/media\/(.+)$/, async (req, res) => {
    const target = req.params[0]
    if (target.includes('..') || !MEDIA_ALLOW.some((re) => re.test(target))) {
      return res.status(400).json({ error: 'media path not allowed' })
    }
    // The camera-scoped patterns are shaped like plain API paths, so `config`,
    // `stats` or `users` would sail through as a "camera name". Only real
    // cameras are allowed in that slot.
    const first = target.split('/')[0]
    if (first !== 'events' && first !== 'review') {
      const known = await discover().then(({ cams }) => cams.some((c) => c.name === first)).catch(() => false)
      if (!known) return res.status(404).json({ error: `unknown camera "${first}"` })
    }
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(req.query)) {
      if (MEDIA_PARAMS.has(k)) qs.set(k, String(v))
    }
    // MJPEG never ends and clips can be long — abort upstream when the browser
    // closes the tab, or ffmpeg-side readers pile up forever
    const ctl = new AbortController()
    res.on('close', () => ctl.abort())
    try {
      const query = qs.toString()
      const upstream = await fapi(`/${target}${query ? `?${query}` : ''}`, {
        signal: ctl.signal,
        stream: true,
        headers: req.headers.range ? { Range: req.headers.range } : {},
      })
      res.status(upstream.status)
      for (const h of ['content-type', 'content-length', 'accept-ranges', 'content-range']) {
        const v = upstream.headers.get(h)
        if (v) res.set(h, v)
      }
      // snapshots must not be cached (they'd freeze); event media is immutable
      res.set('Cache-Control', /latest\.|^[a-zA-Z0-9_-]+$/.test(target)
        ? 'no-store'
        : 'private, max-age=86400')
      if (!upstream.body) return res.end()
      Readable.fromWeb(upstream.body).pipe(res)
    } catch (e) {
      if (ctl.signal.aborted) return
      if (!res.headersSent) res.status(502).json({ error: `Frigate media error: ${e.message}` })
      else res.end()
    }
  })

  return r
}

/** Stand-in when Frigate isn't configured: the UI shows a setup hint. */
function disabledRouter() {
  const r = express.Router()
  r.get('/state', (_req, res) => res.json({ enabled: false, cameras: [], alerts: [], objects: [] }))
  r.all('*', (_req, res) => res.status(404).json({ error: 'Frigate not configured (set FRIGATE_URL)' }))
  return r
}

/**
 * Mounted by the server: the real proxy when FRIGATE_URL is set, a demo feed in
 * mock mode, and a "not configured" stub otherwise.
 */
export const frigate = (mock = false) =>
  FRIGATE_ENABLED ? frigateRouter() : mock ? frigateMockRouter() : disabledRouter()
