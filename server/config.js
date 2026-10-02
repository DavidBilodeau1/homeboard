import fs from 'fs'
import path from 'path'
import { migrateConfig } from './migrate.js'

const WATCH_DEBOUNCE_MS = 200

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    if (e.code === 'ENOENT') return {}
    throw e
  }
}

function writeAtomically(file, data) {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n')
  fs.renameSync(tmp, file)
}

/** The dashboard configuration file: a missing file reads as an empty config. */
export function createConfigStore(file) {
  const listeners = new Set()
  const notify = () => listeners.forEach((listener) => listener())

  const read = () => migrateConfig(readJson(file))

  const tryRead = () => {
    try {
      return read()
    } catch {
      return null
    }
  }

  const write = (config) => {
    try { fs.copyFileSync(file, `${file}.bak`) } catch { /* first save: nothing to back up */ }
    writeAtomically(file, config)
    notify()
  }

  const watchForEdits = () => {
    let timer
    try {
      fs.watch(path.dirname(file), (_event, name) => {
        if (name !== path.basename(file)) return
        clearTimeout(timer)
        timer = setTimeout(notify, WATCH_DEBOUNCE_MS)
      })
    } catch { /* fs.watch unsupported: edits apply on the next save */ }
  }
  watchForEdits()

  return {
    dir: path.dirname(file),
    read,
    write,
    onChange: (listener) => listeners.add(listener),
    pluginSettings: (id) => tryRead()?.plugins?.[id] ?? {},
    isPluginEnabled: (id) => tryRead()?.plugins?.[id]?.enabled === true,
    tryRead,
  }
}
