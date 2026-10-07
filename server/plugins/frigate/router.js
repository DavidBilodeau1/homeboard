import express from 'express'
import { Readable } from 'stream'
import { frigateFetch, frigateJson } from './client.js'

const CAMERA_CACHE_MS = 60_000
const DEFAULT_ALERT_LIMIT = 20
const DEFAULT_EVENT_LIMIT = 24
const MAX_LIMIT = 100

/** Frigate hands out epoch seconds in most places but ISO strings in a few. */
const secs = (v) => {
  if (typeof v === 'number') return v
  const parsed = typeof v === 'string' && v ? Date.parse(v) : NaN
  return Number.isFinite(parsed) ? parsed / 1000 : null
}
const uniq = (a) => [...new Set((a ?? []).filter(Boolean))]
const arr = (v) => (Array.isArray(v) ? v : [])
const mbToGb = (v) => (typeof v === 'number' ? Math.round((v / 1024) * 10) / 10 : null)
const limitParam = (v, fallback) => Math.min(Number(v) || fallback, MAX_LIMIT)

const severityRank = (s) => (s === 'alert' ? 0 : 1)

/** One feed from both review buckets, alerts first then newest; Frigate 0.16 flipped what `reviewed=1` means. */
export function mergeReview(lists, limit) {
  const byId = new Map()
  for (const item of lists.flatMap(arr)) if (item?.id && !byId.has(item.id)) byId.set(item.id, item)
  return [...byId.values()]
    .sort((a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      (secs(b.start_time) ?? 0) - (secs(a.start_time) ?? 0))
    .slice(0, limit)
}

const toCamera = ([name, c], defaults) => ({
  name,
  label: c?.friendly_name || name.replace(/_/g, ' ').replace(/\b\w/g, (s) => s.toUpperCase()),
  width: c?.detect?.width ?? null,
  height: c?.detect?.height ?? null,
  snapshots: c?.snapshots?.enabled !== false,
  recording: c?.record?.enabled === true,
  audio: c?.audio?.enabled === true,
  zones: Object.keys(c?.zones ?? {}),
  objects: c?.objects?.track ?? defaults?.objects?.track ?? [],
  birdseyeOrder: c?.birdseye?.order ?? 0,
})

let cameraCache = { at: 0, cams: [], version: null }

/** Enabled cameras, read from Frigate's own config. */
async function discoverCameras() {
  if (Date.now() - cameraCache.at < CAMERA_CACHE_MS && cameraCache.cams.length) return cameraCache
  const [config, version] = await Promise.all([frigateJson('/config'), frigateJson('/version').catch(() => null)])
  const cams = Object.entries(config?.cameras ?? {})
    .filter(([, c]) => c?.enabled !== false)
    .map((entry) => toCamera(entry, config))
    .sort((a, b) => a.birdseyeOrder - b.birdseyeOrder || a.name.localeCompare(b.name))
  cameraCache = { at: Date.now(), cams, version: typeof version === 'string' ? version : version?.version ?? null }
  return cameraCache
}

const toStorage = ([mount, s]) => ({
  mount,
  usedPct: s?.total ? Math.round((s.used / s.total) * 100) : null,
  usedGb: mbToGb(s?.used),
  totalGb: mbToGb(s?.total),
})

const toCameraHealth = (s = {}) => {
  const fps = s.camera_fps ?? null
  return {
    fps,
    detectionFps: s.detection_fps ?? null,
    skippedFps: s.skipped_fps ?? null,
    // Frigate zeroes camera_fps when ffmpeg can't reach the camera
    online: fps == null ? null : fps > 0,
    audioRms: s.audio_rms ?? null,
    audioDbfs: s.audio_dBFS ?? null,
  }
}

function health(stats, cams, version) {
  const service = stats?.service ?? {}
  const storages = Object.entries(service.storage ?? {}).map(toStorage)
  storages.sort((a, b) => Number(b.mount.includes('recordings')) - Number(a.mount.includes('recordings')))
  return {
    version: version ?? service.version ?? null,
    latestVersion: service.latest_version ?? null,
    uptime: service.uptime ?? null,
    detectors: Object.entries(stats?.detectors ?? {}).map(([name, d]) => ({ name, inferenceSpeed: d?.inference_speed ?? null })),
    gpus: Object.entries(stats?.gpu_usages ?? {}).map(([name, g]) => ({ name, usage: g?.gpu ?? null, mem: g?.mem ?? null })),
    storage: storages[0] ?? null,
    cameras: Object.fromEntries(cams.map((c) => [c.name, toCameraHealth(stats?.cameras?.[c.name])])),
  }
}

const toAlert = (v) => ({
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
  detections: v.data?.detections ?? [],
})

const toObject = (e) => ({
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
})

async function readState(alertLimit, eventLimit) {
  const { cams, version } = await discoverCameras()
  // a failing part must surface as a warning, not as an empty feed that looks quiet
  const warnings = []
  const soft = (path, fallback) => frigateJson(path).catch((e) => { warnings.push(e.message); return fallback })
  const [unseen, seen, events, stats, summary] = await Promise.all([
    soft(`/review?limit=${alertLimit}&reviewed=0`, []),
    soft(`/review?limit=${alertLimit}&reviewed=1`, []),
    soft(`/events?limit=${eventLimit}&has_snapshot=1`, []),
    soft('/stats', null),
    soft('/review/summary', null),
  ])
  const alerts = mergeReview([unseen, seen], alertLimit).map(toAlert)
  const last24 = summary?.last24Hours ?? {}
  return {
    enabled: true,
    cameras: cams,
    alerts,
    objects: arr(events).map(toObject),
    health: health(stats, cams, version),
    summary: {
      alerts24h: last24.total_alert ?? null,
      detections24h: last24.total_detection ?? null,
      unreviewed: alerts.filter((a) => !a.reviewed && a.severity === 'alert').length,
    },
    warnings: uniq(warnings),
    at: Date.now(),
  }
}

const CAM = '[a-zA-Z0-9_-]+'
const ID = '[a-zA-Z0-9._-]+'
const TS = '[0-9.]+'
/** The only media shapes proxied, so the route can't reach Frigate's config or users API. */
const MEDIA_ALLOW = [
  new RegExp(`^${CAM}$`),
  new RegExp(`^${CAM}/latest\\.(jpg|png|webp)$`),
  new RegExp(`^${CAM}/start/${TS}/end/${TS}/preview\\.(mp4|gif)$`),
  new RegExp(`^${CAM}/recordings/${TS}/snapshot\\.(jpg|png)$`),
  new RegExp(`^events/${ID}/(snapshot|thumbnail)\\.(jpg|png|webp)$`),
  new RegExp(`^events/${ID}/(clip\\.mp4|preview\\.gif)$`),
  new RegExp(`^review/${ID}/(clip\\.mp4|preview)$`),
]
const MEDIA_PARAMS = new Set([
  'h', 'height', 'quality', 'bbox', 'timestamp', 'zones', 'mask', 'motion',
  'regions', 'paths', 'fps', 'format', 'padding', 'crop', 'max_cache_age',
])
const LIVE_MEDIA = /latest\.|^[a-zA-Z0-9_-]+$/
const PASSTHROUGH_HEADERS = ['content-type', 'content-length', 'accept-ranges', 'content-range']

async function isAllowedMedia(target) {
  if (target.includes('..') || !MEDIA_ALLOW.some((re) => re.test(target))) return false
  const first = target.split('/')[0]
  if (first === 'events' || first === 'review') return true
  // camera-shaped paths would otherwise let `config` or `stats` through as a camera name
  return discoverCameras().then(({ cams }) => cams.some((c) => c.name === first)).catch(() => false)
}

const mediaQuery = (query) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) if (MEDIA_PARAMS.has(key)) params.set(key, String(value))
  const text = params.toString()
  return text ? `?${text}` : ''
}

async function proxyMedia(req, res) {
  const target = req.params[0]
  if (!(await isAllowedMedia(target))) return res.status(400).json({ error: 'media path not allowed' })
  // MJPEG never ends: stop reading upstream once the browser goes away
  const abort = new AbortController()
  res.on('close', () => abort.abort())
  try {
    const upstream = await frigateFetch(`/${target}${mediaQuery(req.query)}`, {
      signal: abort.signal,
      stream: true,
      headers: req.headers.range ? { Range: req.headers.range } : {},
    })
    res.status(upstream.status)
    for (const header of PASSTHROUGH_HEADERS) {
      const value = upstream.headers.get(header)
      if (value) res.set(header, value)
    }
    res.set('Cache-Control', LIVE_MEDIA.test(target) ? 'no-store' : 'private, max-age=86400')
    if (!upstream.body) return res.end()
    Readable.fromWeb(upstream.body).pipe(res)
  } catch (e) {
    if (abort.signal.aborted) return
    if (res.headersSent) res.end()
    else res.status(502).json({ error: `Frigate media error: ${e.message}` })
  }
}

export function frigateRouter() {
  const router = express.Router()

  router.get('/state', async (req, res) => {
    res.set('Cache-Control', 'no-store')
    try {
      res.json(await readState(
        limitParam(req.query.alerts, DEFAULT_ALERT_LIMIT),
        limitParam(req.query.events, DEFAULT_EVENT_LIMIT),
      ))
    } catch (e) {
      res.status(502).json({ enabled: true, error: `Frigate unreachable: ${e.message}` })
    }
  })

  router.get('/motion', async (req, res) => {
    const camera = String(req.query.camera || '')
    if (!/^[a-zA-Z0-9_-]+$/.test(camera)) return res.status(400).json({ error: 'invalid camera' })
    const minutes = Math.min(Math.max(Number(req.query.minutes) || 60, 5), 24 * 60)
    const before = Math.floor(Date.now() / 1000)
    const after = before - minutes * 60
    const scale = Math.max(minutes, 15)
    try {
      const rows = await frigateJson(
        `/review/activity/motion?cameras=${encodeURIComponent(camera)}&after=${after}&before=${before}&scale=${scale}`,
      )
      res.set('Cache-Control', 'no-store')
      res.json({ camera, after, before, points: arr(rows).map((p) => Math.max(0, Number(p.motion) || 0)) })
    } catch (e) {
      res.status(502).json({ error: e.message })
    }
  })

  router.post('/reviewed', async (req, res) => {
    const ids = (req.body?.ids ?? []).filter((id) => typeof id === 'string')
    if (!ids.length) return res.status(400).json({ error: 'ids required' })
    try {
      const r = await frigateFetch('/reviews/viewed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, reviewed: true }),
      })
      if (!r.ok) return res.status(r.status).json({ error: `Frigate returned HTTP ${r.status}` })
      res.json({ ok: true, count: ids.length })
    } catch (e) {
      res.status(502).json({ error: e.message })
    }
  })

  router.get(/^\/media\/(.+)$/, proxyMedia)

  return router
}
