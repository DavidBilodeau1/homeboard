import { describe, expect, it } from 'vitest'
import { migrateConfig } from './migrate.js'

describe('migrateConfig', () => {
  it('leaves a current config untouched', () => {
    const config = { calendars: [], plugins: { hockey: { enabled: false } } }
    expect(migrateConfig(config)).toBe(config)
  })

  it('moves legacy sections under plugins, enabled', () => {
    const migrated = migrateConfig({
      weatherEntity: 'weather.home',
      frigate: { pollSeconds: 15 },
      hockey: { entity: 'sensor.nhl_mtl' },
    })
    expect(migrated).toEqual({
      weatherEntity: 'weather.home',
      plugins: {
        frigate: { enabled: true, pollSeconds: 15 },
        hockey: { enabled: true, entity: 'sensor.nhl_mtl' },
      },
    })
  })

  it('wraps the legacy garbage rows as collections', () => {
    const rows = [{ name: 'Trash', entity: 'sensor.trash', color: '#3d9b63' }]
    expect(migrateConfig({ garbage: rows }).plugins.garbage).toEqual({ enabled: true, collections: rows })
  })

  it('keeps settings already saved under plugins', () => {
    const migrated = migrateConfig({ hockey: { entity: 'sensor.old' }, plugins: { hockey: { enabled: false, entity: 'sensor.new' } } })
    expect(migrated.plugins.hockey).toEqual({ enabled: false, entity: 'sensor.new' })
    expect(migrated).not.toHaveProperty('hockey')
  })

  it('drops empty legacy sections', () => {
    expect(migrateConfig({ airQuality: null })).toEqual({ plugins: {} })
  })

  it('passes non-objects through for validation to reject', () => {
    expect(migrateConfig(null)).toBeNull()
    expect(migrateConfig([1])).toEqual([1])
  })
})
