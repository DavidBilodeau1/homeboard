import express from 'express'
import fs from 'fs'
import path from 'path'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif'])

function localPhotos(dir) {
  try {
    return fs.readdirSync(dir)
      .filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()))
      .sort()
      .map((file) => `/photos/${encodeURIComponent(file)}`)
  } catch {
    return []
  }
}

/** Slideshow photos from the first plugin `photoSource` that has any, else from the local folder. */
export function photosRouter({ dir, sources }) {
  const router = express.Router()

  router.get('/api/photos', async (_req, res) => {
    for (const source of sources()) {
      try {
        const urls = await source.list()
        if (urls.length) return res.json(urls)
      } catch (e) {
        console.warn(`[homeboard] ${source.name} unavailable (${e.message}) — falling back to local photos`)
      }
    }
    res.json(localPhotos(dir))
  })

  router.use('/photos', express.static(dir, { maxAge: '1h' }))
  return router
}
