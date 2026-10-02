import express from 'express'
import { createServer } from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import { createAuth } from './auth.js'
import { createConfigStore } from './config.js'
import { haProxy, subscribeToStateChanges } from './homeAssistant.js'
import { createEntityFilter, createLiveUpdates } from './liveUpdates.js'
import { mockHaEvents, mockHaRouter } from './mock/homeAssistant.js'
import { photosRouter } from './photos.js'
import { PLUGINS, describeService, pluginStatus } from './plugins/index.js'
import { validateConfig } from './validate.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const env = process.env
const trimUrl = (url) => (url || '').replace(/\/+$/, '')

const PORT = Number(env.PORT || 8090)
const HA = { url: trimUrl(env.HA_URL), token: env.HA_TOKEN || '' }
const MOCK = env.MOCK === '1' || !HA.url || !HA.token
const PUBLIC_URL = trimUrl(env.PUBLIC_URL)
const AUTH_ENABLED = env.AUTH_ENABLED !== '0' && Boolean(PUBLIC_URL) && !MOCK
const EDITOR_ENABLED = env.EDITOR_ENABLED !== '0'
const PHOTOS_DIR = env.PHOTOS_DIR || path.join(__dirname, '../photos')
const DIST = path.join(__dirname, '../dist')

const configStore = createConfigStore(env.CONFIG_PATH || path.join(__dirname, '../config/config.json'))
const auth = createAuth({
  enabled: AUTH_ENABLED,
  haUrl: HA.url,
  publicUrl: PUBLIC_URL,
  secret: env.SESSION_SECRET,
  secretFile: path.join(configStore.dir, '.hb_session_secret'),
})

const app = express()
app.set('trust proxy', true)
app.use(express.json())
app.use(auth.router)
app.use('/api', auth.requireAuth)
app.use('/photos', auth.requireAuth)

app.get('/api/config', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  try {
    res.json(configStore.read())
  } catch (e) {
    res.status(500).json({ error: `Cannot read config: ${e.message}` })
  }
})

app.put('/api/config', (req, res) => {
  if (!EDITOR_ENABLED) return res.status(403).json({ error: 'editor disabled (EDITOR_ENABLED=0)' })
  const error = validateConfig(req.body)
  if (error) return res.status(400).json({ error })
  try {
    configStore.write(req.body)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: `Cannot write config: ${e.message}` })
  }
})

app.get('/api/meta', (req, res) => res.json({
  editorEnabled: EDITOR_ENABLED,
  mock: MOCK,
  authEnabled: AUTH_ENABLED,
  user: auth.sessionUser(req),
  plugins: Object.fromEntries(PLUGINS.map((plugin) => [plugin.id, { available: pluginStatus(plugin, MOCK).available }])),
}))

const requireEnabled = (id) => (_req, res, next) =>
  configStore.isPluginEnabled(id) ? next() : res.status(404).json({ error: `plugin "${id}" is disabled` })

const pluginContext = (plugin) => ({
  mock: pluginStatus(plugin, MOCK).mocked,
  dataDir: configStore.dir,
  canWrite: EDITOR_ENABLED,
  settings: () => configStore.pluginSettings(plugin.id),
})

const servablePlugins = PLUGINS.filter((plugin) => pluginStatus(plugin, MOCK).available)
for (const plugin of servablePlugins.filter((p) => p.router)) {
  app.use(`/api/plugins/${plugin.id}`, requireEnabled(plugin.id), plugin.router(pluginContext(plugin)))
}

const photoSources = servablePlugins
  .filter((plugin) => plugin.photoSource)
  .map((plugin) => ({ id: plugin.id, source: plugin.photoSource(pluginContext(plugin)) }))
app.use(photosRouter({
  dir: PHOTOS_DIR,
  sources: () => photoSources.filter(({ id }) => configStore.isPluginEnabled(id)).map(({ source }) => source),
}))

app.use('/api/ha', MOCK ? mockHaRouter() : haProxy(HA))

app.use(express.static(DIST, { maxAge: '1h', index: false }))
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'not found' })
  res.sendFile(path.join(DIST, 'index.html'))
})

const server = createServer(app)
const live = createLiveUpdates(server, { isAuthorized: (req) => !!auth.sessionUser(req) })
const isRelevant = createEntityFilter(configStore)
const forward = (entityId) => isRelevant(entityId) && live.broadcast(entityId)

if (MOCK) mockHaEvents.on('state_changed', forward)
else subscribeToStateChanges(HA, forward)

server.listen(PORT, () => {
  console.log(`[homeboard] listening on :${PORT}${MOCK ? ' (MOCK mode)' : ` → ${HA.url}`}`)
  for (const plugin of PLUGINS.filter((p) => p.service)) console.log(`[homeboard] ${describeService(plugin, MOCK)}`)
  console.log(`[homeboard] auth ${AUTH_ENABLED ? `ENABLED via ${PUBLIC_URL}` : 'DISABLED (set PUBLIC_URL to enable)'}`)
})
