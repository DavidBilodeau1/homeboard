import express from 'express'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { spawn } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { mockRouter } from './mock.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 8090)
const HA_URL = (process.env.HA_URL || '').replace(/\/+$/, '')
const HA_TOKEN = process.env.HA_TOKEN || ''
const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, '../config/config.json')
const PHOTOS_DIR = process.env.PHOTOS_DIR || path.join(__dirname, '../photos')
const MOCK = process.env.MOCK === '1' || !HA_URL || !HA_TOKEN
// Immich photo source (optional): strip any trailing /api — we add it per call
const IMMICH_URL = (process.env.IMMICH_URL || '').replace(/\/+$/, '').replace(/\/api$/, '')
const IMMICH_API_KEY = process.env.IMMICH_API_KEY || ''
const IMMICH_ALBUM = process.env.IMMICH_ALBUM || 'Wallpanel'
const IMMICH_ENABLED = Boolean(IMMICH_URL && IMMICH_API_KEY)
// visual config editor in Settings; set EDITOR_ENABLED=0 for a wall-mounted read-only panel
const EDITOR_ENABLED = process.env.EDITOR_ENABLED !== '0'

// ---------- authentication (Log in with Home Assistant / OAuth2 IndieAuth) ----------
// Auth turns on automatically once PUBLIC_URL is set (the externally reachable base
// URL of HomeBoard). Set AUTH_ENABLED=0 to force it off (trusted LAN only).
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '')
const AUTH_ENABLED = process.env.AUTH_ENABLED === '0'
  ? false
  : Boolean(PUBLIC_URL) && !MOCK
const OAUTH_CLIENT_ID = PUBLIC_URL
const OAUTH_REDIRECT_URI = `${PUBLIC_URL}/auth/callback`
const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000 // 60 days

// stable secret for signing session cookies — generated & persisted next to the
// config if not supplied, so logins survive container restarts
const SESSION_SECRET = (() => {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET
  const p = path.join(path.dirname(CONFIG_PATH), '.hb_session_secret')
  try { return fs.readFileSync(p, 'utf8').trim() } catch { /* not yet created */ }
  const s = crypto.randomBytes(32).toString('hex')
  try { fs.writeFileSync(p, s, { mode: 0o600 }) } catch (e) { console.warn(`[homeboard] could not persist session secret: ${e.message}`) }
  return s
})()

const b64url = (buf) => Buffer.from(buf).toString('base64url')
const hmac = (data) => crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url')

// stateless signed token: base64url(json).signature
function signToken(payload) {
  const body = b64url(JSON.stringify(payload))
  return `${body}.${hmac(body)}`
}
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = hmac(body)
  // constant-time compare
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (payload.exp && Date.now() > payload.exp) return null
    return payload
  } catch { return null }
}

const parseCookies = (req) => Object.fromEntries(
  (req.headers.cookie || '').split(';').map((c) => {
    const i = c.indexOf('=')
    return i < 0 ? [c.trim(), ''] : [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())]
  }).filter(([k]) => k),
)
const setCookie = (req, res, name, value, maxAgeMs) => {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https'
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/', 'HttpOnly', 'SameSite=Lax',
    maxAgeMs != null ? `Max-Age=${Math.floor(maxAgeMs / 1000)}` : '',
    secure ? 'Secure' : '',
  ].filter(Boolean)
  res.append('Set-Cookie', parts.join('; '))
}
const clearCookie = (res, name) => res.append('Set-Cookie', `${name}=; Path=/; HttpOnly; Max-Age=0`)

const sessionUser = (req) => {
  if (!AUTH_ENABLED) return 'local'
  const payload = verifyToken(parseCookies(req).hb_session)
  return payload?.sub ?? null
}

function requireAuth(req, res, next) {
  if (!AUTH_ENABLED) return next()
  if (sessionUser(req)) return next()
  res.status(401).json({ error: 'authentication required' })
}

const app = express()
app.set('trust proxy', true)
app.use(express.json())

// ---------- public: session status + auth routes ----------
app.get('/api/session', (req, res) => {
  res.json({ authEnabled: AUTH_ENABLED, authenticated: !!sessionUser(req), user: sessionUser(req) })
})

app.get('/auth/login', (req, res) => {
  if (!AUTH_ENABLED) return res.redirect('/')
  const state = crypto.randomBytes(16).toString('hex')
  setCookie(req, res, 'hb_oauth_state', signToken({ state, exp: Date.now() + 10 * 60_000 }), 10 * 60_000)
  const url = `${HA_URL}/auth/authorize?client_id=${encodeURIComponent(OAUTH_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}&state=${state}`
  res.redirect(url)
})

app.get('/auth/callback', async (req, res) => {
  if (!AUTH_ENABLED) return res.redirect('/')
  const { code, state } = req.query
  const stateCookie = verifyToken(parseCookies(req).hb_oauth_state)
  clearCookie(res, 'hb_oauth_state')
  if (!code || !state || !stateCookie || stateCookie.state !== state) {
    return res.redirect('/?auth_error=state')
  }
  try {
    const body = new URLSearchParams({ grant_type: 'authorization_code', code: String(code), client_id: OAUTH_CLIENT_ID })
    const r = await fetch(`${HA_URL}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!r.ok) {
      console.warn(`[homeboard] token exchange failed: HTTP ${r.status}`)
      return res.redirect('/?auth_error=token')
    }
    const tok = await r.json()
    // fetch the logged-in user's name (best-effort) to label the session
    let user = 'hass'
    try {
      const who = await fetch(`${HA_URL}/api/`, { headers: { Authorization: `Bearer ${tok.access_token}` } })
      if (who.ok) user = 'hass' // /api/ has no name; keep generic. Token validity is what matters.
    } catch { /* ignore */ }
    setCookie(req, res, 'hb_session', signToken({ sub: user, iat: Date.now(), exp: Date.now() + SESSION_TTL_MS }), SESSION_TTL_MS)
    res.redirect('/')
  } catch (e) {
    console.warn(`[homeboard] auth callback error: ${e.message}`)
    res.redirect('/?auth_error=exchange')
  }
})

app.post('/auth/logout', (_req, res) => { clearCookie(res, 'hb_session'); res.json({ ok: true }) })

// everything under /api and /photos (except /api/session above) requires a session
app.use('/api', requireAuth)
app.use('/photos', requireAuth)

// ---------- app config ----------
app.get('/api/config', (_req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')))
  } catch (e) {
    res.status(500).json({ error: `Cannot read config at ${CONFIG_PATH}: ${e.message}` })
  }
})

app.get('/api/meta', (req, res) => res.json({
  editorEnabled: EDITOR_ENABLED, mock: MOCK, authEnabled: AUTH_ENABLED, user: sessionUser(req),
}))

const isNamedRows = (v) =>
  v === undefined ||
  (Array.isArray(v) && v.every((r) => r && typeof r === 'object' && typeof r.name === 'string' &&
    (r.entity === null || r.entity === undefined || typeof r.entity === 'string')))

function validateConfig(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return 'config must be a JSON object'
  if (typeof c.weatherEntity !== 'string' || !c.weatherEntity) return 'weatherEntity must be a non-empty string'
  for (const k of ['calendars', 'tasks', 'meals', 'lists', 'rewards']) {
    if (k === 'calendars') {
      if (!Array.isArray(c.calendars) || !c.calendars.every((r) => r && typeof r.entity === 'string')) {
        return 'calendars must be an array of { entity, name?, color }'
      }
    } else if (!isNamedRows(c[k])) return `${k} must be an array of { name, entity }`
  }
  if (c.smartHome !== undefined) {
    const sh = c.smartHome
    if (!sh || typeof sh !== 'object' || Array.isArray(sh)) return 'smartHome must be an object'
    for (const k of ['cameras', 'sensors', 'lights', 'locks']) {
      if (!isNamedRows(sh[k])) return `smartHome.${k} must be an array of { name, entity }`
    }
  }
  if (c.garbage !== undefined && !isNamedRows(c.garbage)) {
    return 'garbage must be an array of { name, entity, color }'
  }
  if (c.airQuality !== undefined && c.airQuality !== null) {
    const a = c.airQuality
    if (typeof a !== 'object' || Array.isArray(a) || typeof a.entity !== 'string') {
      return 'airQuality must be an object with an entity string'
    }
  }
  if (c.dashboard !== undefined) {
    const d = c.dashboard
    if (!d || typeof d !== 'object' || Array.isArray(d)) return 'dashboard must be an object'
    if (!Array.isArray(d.tiles)) return 'dashboard.tiles must be an array'
    const ok = d.tiles.every((tile) => tile && typeof tile.id === 'string' &&
      ['x', 'y', 'w', 'h'].every((f) => Number.isFinite(tile[f])))
    if (!ok) return 'dashboard.tiles items must be { id, x, y, w, h }'
  }
  return null
}

app.put('/api/config', (req, res) => {
  if (!EDITOR_ENABLED) return res.status(403).json({ error: 'editor disabled (EDITOR_ENABLED=0)' })
  const err = validateConfig(req.body)
  if (err) return res.status(400).json({ error: err })
  try {
    try { fs.copyFileSync(CONFIG_PATH, `${CONFIG_PATH}.bak`) } catch { /* first save: nothing to back up */ }
    const tmp = `${CONFIG_PATH}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(req.body, null, 2) + '\n')
    fs.renameSync(tmp, CONFIG_PATH)
    rebuildWatchSet()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: `Cannot write config: ${e.message}` })
  }
})

// ---------- camera live stream (HLS) ----------
// Runs one HA websocket command and resolves its result, then closes.
function haCommand(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(HA_URL.replace(/^http/, 'ws') + '/api/websocket')
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('HA command timeout')) }, 10_000)
    const done = (fn, arg) => { clearTimeout(timer); try { ws.close() } catch { /* already closing */ } fn(arg) }
    ws.on('message', (data) => {
      let msg
      try { msg = JSON.parse(data.toString()) } catch { return }
      if (msg.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: HA_TOKEN }))
      else if (msg.type === 'auth_ok') ws.send(JSON.stringify({ id: 1, type, ...payload }))
      else if (msg.type === 'auth_invalid') done(reject, new Error('HA auth failed'))
      else if (msg.type === 'result') {
        if (msg.success) done(resolve, msg.result)
        else done(reject, new Error(msg.error?.message || 'HA command failed'))
      }
    })
    ws.on('error', (e) => { clearTimeout(timer); reject(e) })
  })
}

// ---------- direct camera streaming (ffmpeg: RTSP → HLS, bypassing HA) ----------
// When a camera in config has an `rtsp` (and/or `rtspZoom`) URL, HomeBoard pulls
// the feed straight from the camera and repackages it to HLS with ffmpeg — no HA
// in the video path. The RTSP URL (with credentials) never leaves the server;
// the browser only sees /api/camstream/<entity>/… . Falls back to HA if the
// direct feed can't be produced.
const CAM_ROOT = path.join(os.tmpdir(), 'homeboard-cam')
const camDir = (entity) => path.join(CAM_ROOT, entity.replace(/[^a-z0-9_.]/gi, '_'))
const cams = new Map() // entity -> { proc, lastAccess }

function rtspForEntity(entity) {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    for (const c of cfg.smartHome?.cameras ?? []) {
      if (c.entity === entity && c.rtsp) return c.rtsp
      if (c.zoomEntity === entity && c.rtspZoom) return c.rtspZoom
    }
  } catch { /* config unreadable */ }
  return null
}

function startCam(entity, rtsp) {
  const existing = cams.get(entity)
  if (existing && existing.proc && existing.proc.exitCode === null) {
    existing.lastAccess = Date.now()
    return existing
  }
  const dir = camDir(entity)
  fs.mkdirSync(dir, { recursive: true })
  for (const f of fs.readdirSync(dir)) { try { fs.unlinkSync(path.join(dir, f)) } catch { /* ignore */ } }
  // -c:v copy (no transcode, light CPU), low-latency HLS, drop audio for reliability
  const proc = spawn('ffmpeg', [
    '-nostdin', '-loglevel', 'error',
    '-rtsp_transport', 'tcp',
    '-i', rtsp,
    '-an', '-c:v', 'copy',
    '-f', 'hls',
    '-hls_time', '1',
    '-hls_list_size', '6',
    '-hls_flags', 'delete_segments+append_list+omit_endlist',
    '-hls_segment_type', 'mpegts',
    '-hls_segment_filename', 'seg%d.ts',
    'index.m3u8',
  ], { cwd: dir })
  let errTail = ''
  proc.stderr.on('data', (d) => { errTail = (errTail + d).slice(-500) })
  proc.on('exit', (code) => {
    if (code) console.warn(`[homeboard] ffmpeg for ${entity} exited (${code}): ${errTail.trim()}`)
    if (cams.get(entity)?.proc === proc) cams.delete(entity)
  })
  const cam = { proc, lastAccess: Date.now() }
  cams.set(entity, cam)
  return cam
}

const waitForPlaylist = (dir, ms) => new Promise((resolve) => {
  const started = Date.now()
  const tick = () => {
    // ready once the playlist exists and references at least one segment
    try {
      const pl = fs.readFileSync(path.join(dir, 'index.m3u8'), 'utf8')
      if (/\.ts/.test(pl)) return resolve(true)
    } catch { /* not yet */ }
    if (Date.now() - started > ms) return resolve(false)
    setTimeout(tick, 250)
  }
  tick()
})

// kill idle ffmpeg processes (no segment/playlist fetch in the last 40s)
setInterval(() => {
  const now = Date.now()
  for (const [entity, cam] of cams) {
    if (now - cam.lastAccess > 40_000) {
      try { cam.proc.kill('SIGKILL') } catch { /* ignore */ }
      cams.delete(entity)
    }
  }
}, 15_000)

// serve the ffmpeg-generated HLS files (gated by the /api requireAuth above)
app.get('/api/camstream/:entity/:file', (req, res) => {
  const { entity, file } = req.params
  if (!/^camera\.[a-z0-9_]+$/.test(entity) || !/^[a-z0-9_.]+$/i.test(file)) return res.status(400).end()
  const dir = camDir(entity)
  const fp = path.join(dir, file)
  if (!fp.startsWith(dir + path.sep)) return res.status(400).end()
  const cam = cams.get(entity)
  if (cam) cam.lastAccess = Date.now()
  if (!fs.existsSync(fp)) return res.status(404).end()
  res.set('Cache-Control', 'no-store')
  res.type(file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t')
  fs.createReadStream(fp).pipe(res)
})

// Return an HLS URL for a camera: direct (ffmpeg from RTSP) when configured,
// otherwise Home Assistant's HLS. The browser plays either with the same hls.js.
app.get('/api/camera/:entity/stream', async (req, res) => {
  const entity = req.params.entity
  if (!/^camera\.[a-z0-9_]+$/.test(entity)) return res.status(400).json({ error: 'invalid entity' })

  const rtsp = rtspForEntity(entity)
  if (rtsp) {
    try {
      const cam = startCam(entity, rtsp)
      const ready = await waitForPlaylist(camDir(entity), 12_000)
      if (ready) return res.json({ url: `/api/camstream/${entity}/index.m3u8`, direct: true })
      console.warn(`[homeboard] direct RTSP for ${entity} not ready — falling back to HA`)
    } catch (e) {
      console.warn(`[homeboard] direct RTSP for ${entity} failed (${e.message}) — falling back to HA`)
    }
  }

  // fallback: Home Assistant's HLS, proxied so the token stays server-side
  if (MOCK) return res.status(501).json({ error: 'no stream available' })
  try {
    const result = await haCommand('camera/stream', { entity_id: entity, format: 'hls' })
    if (!result?.url) return res.status(502).json({ error: 'HA returned no stream url' })
    res.json({ url: '/api/ha' + result.url.replace(/^\/api/, '') })
  } catch (e) {
    res.status(502).json({ error: `stream request failed: ${e.message}` })
  }
})

// ---------- photos: Immich album, falling back to local folder ----------
const immichFetch = (p, init = {}) =>
  fetch(`${IMMICH_URL}/api${p}`, {
    ...init,
    headers: { 'x-api-key': IMMICH_API_KEY, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })

let immichAlbumId = null
async function resolveImmichAlbum() {
  if (immichAlbumId) return immichAlbumId
  for (const q of ['', '?shared=true']) {
    const r = await immichFetch(`/albums${q}`)
    if (!r.ok) continue
    const albums = await r.json()
    const found = albums.find((a) => a.albumName?.toLowerCase() === IMMICH_ALBUM.toLowerCase())
    if (found) {
      immichAlbumId = found.id
      console.log(`[homeboard] Immich album "${found.albumName}" → ${found.id} (${found.assetCount} assets)`)
      return immichAlbumId
    }
  }
  throw new Error(`album "${IMMICH_ALBUM}" not found`)
}

let immichCache = { at: 0, ids: [] }
async function immichPhotoIds() {
  if (immichCache.ids.length && Date.now() - immichCache.at < 5 * 60_000) return immichCache.ids
  const albumId = await resolveImmichAlbum()
  const ids = []
  let page = 1
  // the album-detail endpoint may return no assets on recent Immich versions,
  // so page through the search API instead
  while (page && page < 50) {
    const r = await immichFetch('/search/metadata', {
      method: 'POST',
      body: JSON.stringify({ albumIds: [albumId], type: 'IMAGE', size: 250, page }),
    })
    if (!r.ok) throw new Error(`search failed: HTTP ${r.status}`)
    const data = await r.json()
    ids.push(...(data.assets?.items ?? []).map((a) => a.id))
    page = data.assets?.nextPage ? Number(data.assets.nextPage) : null
  }
  // shuffle so the slideshow order varies between refreshes
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  immichCache = { at: Date.now(), ids }
  return ids
}

const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif'])
app.get('/api/photos', async (_req, res) => {
  if (IMMICH_ENABLED) {
    try {
      const ids = await immichPhotoIds()
      if (ids.length) return res.json(ids.map((id) => `/api/immich/${id}`))
    } catch (e) {
      console.warn(`[homeboard] Immich unavailable (${e.message}) — falling back to local photos`)
    }
  }
  try {
    const files = fs.readdirSync(PHOTOS_DIR)
      .filter((f) => IMG_EXT.has(path.extname(f).toLowerCase()))
      .sort()
      .map((f) => `/photos/${encodeURIComponent(f)}`)
    res.json(files)
  } catch {
    res.json([])
  }
})

// proxy image bytes so the Immich API key never reaches the browser;
// use the generated preview (originals may be HEIC, which browsers can't show)
app.get('/api/immich/:id', async (req, res) => {
  if (!IMMICH_ENABLED) return res.status(404).end()
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).end()
  try {
    const r = await immichFetch(`/assets/${req.params.id}/thumbnail?size=preview`)
    if (!r.ok) return res.status(r.status).end()
    res.set('Content-Type', r.headers.get('content-type') || 'image/jpeg')
    res.set('Cache-Control', 'public, max-age=86400, immutable')
    res.send(Buffer.from(await r.arrayBuffer()))
  } catch (e) {
    res.status(502).json({ error: `Immich proxy error: ${e.message}` })
  }
})

app.use('/photos', express.static(PHOTOS_DIR, { maxAge: '1h' }))

// ---------- Home Assistant proxy (token stays server-side) ----------
if (MOCK) {
  console.warn('[homeboard] HA_URL/HA_TOKEN not set (or MOCK=1) — serving MOCK data')
  app.use('/api/ha', mockRouter())
} else {
  app.use('/api/ha', async (req, res) => {
    try {
      const target = `${HA_URL}/api${req.url}`
      const init = {
        method: req.method,
        headers: {
          Authorization: `Bearer ${HA_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
      if (!['GET', 'HEAD'].includes(req.method)) init.body = JSON.stringify(req.body ?? {})
      const r = await fetch(target, init)
      // buffer (not text) so binary payloads like camera_proxy JPEGs survive
      const body = Buffer.from(await r.arrayBuffer())
      res.status(r.status)
        .type(r.headers.get('content-type') || 'application/json')
        .send(body)
    } catch (e) {
      res.status(502).json({ error: `HA proxy error: ${e.message}` })
    }
  })
}

// ---------- static SPA ----------
const DIST = path.join(__dirname, '../dist')
app.use(express.static(DIST, { maxAge: '1h', index: false }))
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'not found' })
  res.sendFile(path.join(DIST, 'index.html'))
})

// ---------- websocket: HA event bridge ----------
const server = createServer(app)
const wss = new WebSocketServer({
  server,
  path: '/ws',
  // browsers connecting to our event bridge must carry a valid session cookie
  verifyClient: (info, cb) => {
    if (!AUTH_ENABLED) return cb(true)
    const ok = !!verifyToken(parseCookies(info.req).hb_session)
    cb(ok, 401, 'Unauthorized')
  },
})

const broadcast = (obj) => {
  const msg = JSON.stringify(obj)
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg)
  }
}

const WATCH_PREFIXES = ['todo.', 'calendar.', 'weather.', 'counter.', 'input_number.', 'person.', 'sun.']

// also watch every entity id referenced anywhere in config.json (lights,
// climate, cameras, locks, alarm, sensors, …) so smart-home tiles update live
let watchEntities = new Set()
function rebuildWatchSet() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    const found = new Set()
    const walk = (v) => {
      if (typeof v === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(v)) found.add(v)
      else if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(cfg)
    watchEntities = found
  } catch { /* keep previous set if config is mid-edit/invalid */ }
}
rebuildWatchSet()
try { fs.watch(CONFIG_PATH, () => setTimeout(rebuildWatchSet, 200)) } catch { /* fs.watch unsupported */ }

const shouldBroadcast = (entityId) =>
  WATCH_PREFIXES.some((p) => entityId.startsWith(p)) || watchEntities.has(entityId)

function connectHA() {
  if (MOCK) return
  const wsUrl = HA_URL.replace(/^http/, 'ws') + '/api/websocket'
  let msgId = 1
  const ha = new WebSocket(wsUrl)
  // reverse proxies drop idle websockets — keep the tunnel warm
  let keepalive = null

  ha.on('message', (data) => {
    let msg
    try { msg = JSON.parse(data.toString()) } catch { return }
    if (msg.type === 'auth_required') {
      ha.send(JSON.stringify({ type: 'auth', access_token: HA_TOKEN }))
    } else if (msg.type === 'auth_ok') {
      console.log('[homeboard] HA websocket connected')
      ha.send(JSON.stringify({ id: msgId++, type: 'subscribe_events', event_type: 'state_changed' }))
      keepalive = setInterval(() => {
        if (ha.readyState === WebSocket.OPEN) ha.send(JSON.stringify({ id: msgId++, type: 'ping' }))
      }, 30_000)
    } else if (msg.type === 'auth_invalid') {
      console.error('[homeboard] HA websocket auth failed — check HA_TOKEN')
      ha.close()
    } else if (msg.type === 'event') {
      const entityId = msg.event?.data?.entity_id ?? ''
      if (shouldBroadcast(entityId)) {
        broadcast({ type: 'state_changed', entity_id: entityId })
      }
    }
  })

  const retry = () => setTimeout(connectHA, 5000)
  ha.on('close', () => { clearInterval(keepalive); console.warn('[homeboard] HA websocket closed, reconnecting in 5s'); retry() })
  ha.on('error', (e) => { console.warn(`[homeboard] HA websocket error: ${e.code ?? e.message ?? e}`); ha.terminate() })
}
connectHA()

server.listen(PORT, () => {
  console.log(`[homeboard] listening on :${PORT}${MOCK ? ' (MOCK mode)' : ` → ${HA_URL}`}`)
  if (IMMICH_ENABLED) console.log(`[homeboard] photos from Immich album "${IMMICH_ALBUM}" @ ${IMMICH_URL}`)
  if (AUTH_ENABLED) console.log(`[homeboard] auth ENABLED — "Log in with Home Assistant" via ${OAUTH_CLIENT_ID}`)
  else console.log(`[homeboard] auth DISABLED (set PUBLIC_URL to enable)`)
})
