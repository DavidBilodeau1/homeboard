import { isObject } from './checks.js'

/** Top-level sections that predate plugins, mapped to their plugin settings. */
const LEGACY_SECTIONS = {
  frigate: (section) => section,
  expensave: (section) => section,
  hockey: (section) => section,
  airQuality: (section) => section,
  floorPlan: (section) => section,
  garbage: (rows) => ({ collections: rows }),
}

/** Moves legacy sections under `plugins`, enabled, so older configs keep working. */
export function migrateConfig(config) {
  if (!isObject(config)) return config
  const legacyKeys = Object.keys(LEGACY_SECTIONS).filter((key) => key in config)
  if (!legacyKeys.length) return config

  const migrated = { ...config, plugins: { ...config.plugins } }
  for (const key of legacyKeys) {
    delete migrated[key]
    if (config[key] == null) continue
    migrated.plugins[key] ??= { enabled: true, ...LEGACY_SECTIONS[key](config[key]) }
  }
  return migrated
}
