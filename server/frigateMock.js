import express from 'express'

/**
 * Mock Frigate NVR — used in MOCK mode (no FRIGATE_URL / no HA credentials) so
 * the camera page can be developed and demoed without a live instance.
 * Shapes match what server/frigate.js normalises out of the real API.
 */

const CAMS = [
  { name: 'front_door', label: 'Front Door', hue: 210, zones: ['porch', 'walkway'] },
  { name: 'driveway', label: 'Driveway', hue: 30, zones: ['driveway', 'street'] },
  { name: 'backyard', label: 'Backyard', hue: 130, zones: ['pool', 'lawn'] },
  { name: 'garage', label: 'Garage', hue: 265, zones: [] },
]
const LABELS = ['person', 'car', 'dog', 'cat', 'package', 'bicycle']

// deterministic pseudo-random so ids stay stable across requests in a session
let seed = 42
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const pick = (a) => a[Math.floor(rnd() * a.length)]

const now = () => Date.now() / 1000

// A run of detections spread over the last few hours, newest first.
const objects = Array.from({ length: 22 }, (_, i) => {
  const cam = pick(CAMS)
  const start = now() - i * 900 - Math.floor(rnd() * 600)
  const label = pick(LABELS)
  return {
    id: `${start.toFixed(3)}-mock${i}`,
    camera: cam.name,
    label,
    subLabel: label === 'person' && rnd() > 0.7 ? 'Alex' : null,
    score: 0.62 + rnd() * 0.37,
    start,
    end: start + 6 + Math.floor(rnd() * 40),
    zones: cam.zones.length && rnd() > 0.4 ? [cam.zones[0]] : [],
    hasClip: true,
    hasSnapshot: true,
    speed: label === 'car' ? Math.round(8 + rnd() * 25) : null,
    plate: label === 'car' && rnd() > 0.7 ? 'F42 KLM' : null,
  }
}).sort((a, b) => b.start - a.start)

// Review segments wrap one or more detections; the first few are still unread.
const alerts = objects.slice(0, 12).map((o, i) => ({
  id: `${o.start.toFixed(3)}-rev${i}`,
  camera: o.camera,
  severity: o.label === 'person' || o.label === 'car' ? 'alert' : 'detection',
  start: o.start,
  end: o.end,
  reviewed: i > 2,
  objects: [o.label],
  subLabels: o.subLabel ? [o.subLabel] : [],
  zones: o.zones,
  audio: [],
  detections: [o.id],
}))

const health = () => ({
  version: '0.16.2-mock',
  latestVersion: '0.16.2',
  uptime: 386_400,
  detectors: [{ name: 'coral', inferenceSpeed: 7.4 + rnd() }],
  gpus: [{ name: 'intel-vaapi', usage: `${(10 + rnd() * 12).toFixed(1)}%`, mem: '-%' }],
  storage: { mount: '/media/frigate/recordings', usedPct: 63, usedGb: 592.4, totalGb: 931.5 },
  cameras: Object.fromEntries(CAMS.map((c, i) => [c.name, {
    fps: i === 3 ? 0 : 5, // the garage plays "offline" so that state is visible
    detectionFps: i === 3 ? 0 : Math.round(rnd() * 20) / 10,
    skippedFps: 0,
    online: i !== 3,
    audioRms: null,
    audioDbfs: null,
  }])),
})

// ---------- fake imagery ----------
const scene = (title, hue, sub, box) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="hsl(${hue} 22% 26%)"/><stop offset="1" stop-color="hsl(${hue} 24% 12%)"/>
  </linearGradient></defs>
  <rect width="640" height="360" fill="url(#g)"/>
  <path d="M0 268 L180 214 L340 262 L500 206 L640 250 L640 360 L0 360 Z" fill="hsl(${hue} 18% 9%)" opacity="0.75"/>
  <circle cx="548" cy="66" r="26" fill="hsl(${hue} 40% 68%)" opacity="0.25"/>
  ${box ? `<rect x="232" y="128" width="150" height="164" fill="none" stroke="#7fd18b" stroke-width="3" rx="3"/>
  <rect x="232" y="106" width="150" height="22" fill="#7fd18b"/>
  <text x="240" y="122" fill="#12291a" font-family="sans-serif" font-size="15" font-weight="700">${box}</text>` : ''}
  <text x="18" y="34" fill="#ffffff" font-family="sans-serif" font-size="21" font-weight="700" opacity="0.92">${title}</text>
  <text x="18" y="344" fill="#ffffff" font-family="sans-serif" font-size="15" opacity="0.6">${sub}</text>
</svg>`

const camOf = (name) => CAMS.find((c) => c.name === name) ?? CAMS[0]
const clock = () => new Date().toLocaleTimeString()

export function frigateMockRouter() {
  const r = express.Router()

  r.get('/state', (_req, res) => res.set('Cache-Control', 'no-store').json({
    enabled: true,
    mock: true,
    cameras: CAMS.map((c) => ({
      name: c.name,
      label: c.label,
      width: 1280,
      height: 720,
      snapshots: true,
      recording: true,
      audio: false,
      zones: c.zones,
      objects: LABELS,
    })),
    alerts,
    objects,
    health: health(),
    summary: {
      alerts24h: alerts.filter((a) => a.severity === 'alert').length,
      detections24h: objects.length,
      unreviewed: alerts.filter((a) => !a.reviewed && a.severity === 'alert').length,
    },
    at: Date.now(),
  }))

  r.get('/motion', (req, res) => {
    const camera = String(req.query.camera || CAMS[0].name)
    // a couple of bursts so the sparkline has shape
    const points = Array.from({ length: 60 }, (_, i) => {
      const burst = Math.exp(-((i - 44) ** 2) / 12) + 0.6 * Math.exp(-((i - 17) ** 2) / 8)
      return Math.round((burst * 70 + rnd() * 6) * 10) / 10
    })
    res.json({ camera, points, after: now() - 3600, before: now() })
  })

  r.post('/reviewed', (req, res) => {
    const ids = req.body?.ids ?? []
    if (!ids.length) return res.status(400).json({ error: 'ids required' })
    for (const id of ids) {
      const a = alerts.find((x) => x.id === id)
      if (a) a.reviewed = true
    }
    res.json({ ok: true, count: ids.length })
  })

  const svg = (res, body) => {
    res.set('Cache-Control', 'no-store').type('image/svg+xml').send(body)
  }

  // live feed + freshest frame
  r.get(/^\/media\/([a-z0-9_-]+)(\/latest\.\w+)?$/, (req, res) => {
    const cam = CAMS.find((c) => c.name === req.params[0])
    if (!cam) return res.status(404).json({ error: `unknown camera "${req.params[0]}"` })
    svg(res, scene(cam.label, cam.hue, `mock feed · ${clock()}`, rnd() > 0.6 ? 'person 84%' : null))
  })

  // event stills — the label rides along in the id we generated above
  r.get(/^\/media\/events\/([a-zA-Z0-9._-]+)\/(snapshot|thumbnail)\.\w+$/, (req, res) => {
    const ev = objects.find((o) => o.id === req.params[0])
    const cam = camOf(ev?.camera)
    svg(res, scene(cam.label, cam.hue,
      ev ? new Date(ev.start * 1000).toLocaleString() : 'unknown event',
      ev ? `${ev.label} ${Math.round((ev.score ?? 0) * 100)}%` : null))
  })

  // no real video in mock mode; the UI falls back to the still
  r.get(/^\/media\/.*\.(mp4|gif)$/, (_req, res) => res.status(404).end())
  r.get(/^\/media\/review\/[^/]+\/preview$/, (_req, res) => res.status(404).end())

  r.all('*', (_req, res) => res.status(404).json({ error: 'frigate mock: not implemented' }))
  return r
}
