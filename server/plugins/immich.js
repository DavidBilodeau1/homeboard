import express from 'express'
import { firstError, isOptionalString } from '../checks.js'

const IMMICH_URL = (process.env.IMMICH_URL || '').replace(/\/+$/, '').replace(/\/api$/, '')
const IMMICH_API_KEY = process.env.IMMICH_API_KEY || ''
const LIST_CACHE_MS = 5 * 60_000
const PAGE_SIZE = 250
const MAX_PAGES = 50
const ASSET_ID = /^[0-9a-f-]{36}$/i

const immichFetch = (path, init = {}) => fetch(`${IMMICH_URL}/api${path}`, {
  ...init,
  headers: { 'x-api-key': IMMICH_API_KEY, 'Content-Type': 'application/json', ...init.headers },
})

const albumIds = new Map()

/** Album id by name, owned or shared with the API key's user. */
async function findAlbum(name) {
  if (albumIds.has(name)) return albumIds.get(name)
  for (const query of ['', '?shared=true']) {
    const r = await immichFetch(`/albums${query}`)
    if (!r.ok) continue
    const found = (await r.json()).find((a) => a.albumName?.toLowerCase() === name.toLowerCase())
    if (found) {
      albumIds.set(name, found.id)
      return found.id
    }
  }
  throw new Error(`album "${name}" not found`)
}

/** Every image in the album, through the search API: album details can come back empty. */
async function albumImageIds(albumId) {
  const ids = []
  for (let page = 1; page && page < MAX_PAGES;) {
    const r = await immichFetch('/search/metadata', {
      method: 'POST',
      body: JSON.stringify({ albumIds: [albumId], type: 'IMAGE', size: PAGE_SIZE, page }),
    })
    if (!r.ok) throw new Error(`search failed: HTTP ${r.status}`)
    const { assets } = await r.json()
    ids.push(...(assets?.items ?? []).map((a) => a.id))
    page = assets?.nextPage ? Number(assets.nextPage) : null
  }
  return ids
}

const shuffle = (items) => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

let listCache = { album: null, at: 0, urls: [] }

async function albumPhotoUrls(album) {
  if (!album) return []
  const cached = listCache.album === album && Date.now() - listCache.at < LIST_CACHE_MS
  if (cached && listCache.urls.length) return listCache.urls
  const ids = await albumImageIds(await findAlbum(album))
  listCache = { album, at: Date.now(), urls: shuffle(ids).map((id) => `/api/plugins/immich/assets/${id}`) }
  return listCache.urls
}

/** Image bytes through the server so the API key never reaches the browser; previews, since originals may be HEIC. */
function immichRouter() {
  const router = express.Router()
  router.get('/assets/:id', async (req, res) => {
    if (!ASSET_ID.test(req.params.id)) return res.status(400).end()
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
  return router
}

export default {
  id: 'immich',
  service: { name: 'Immich', url: IMMICH_URL, configured: Boolean(IMMICH_URL && IMMICH_API_KEY), mockable: false },
  validate: (settings) => firstError([[isOptionalString(settings.album), 'album must be an album name']]),
  router: () => immichRouter(),
  photoSource: ({ settings }) => ({ name: 'Immich', list: () => albumPhotoUrls(settings().album) }),
}
