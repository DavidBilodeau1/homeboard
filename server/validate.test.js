import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { validateConfig } from './validate.js'

const example = () => JSON.parse(readFileSync(new URL('../config/config.example.json', import.meta.url), 'utf8'))

describe('validateConfig', () => {
  it('accepts the shipped example config', () => {
    expect(validateConfig(example())).toBeNull()
  })

  it('rejects non-objects', () => {
    expect(validateConfig(null)).toMatch(/JSON object/)
    expect(validateConfig([])).toMatch(/JSON object/)
    expect(validateConfig('{}')).toMatch(/JSON object/)
  })

  it('requires weatherEntity', () => {
    const c = example()
    delete c.weatherEntity
    expect(validateConfig(c)).toMatch(/weatherEntity/)
  })

  it('rejects malformed calendars', () => {
    const c = example()
    c.calendars = [{ name: 'no entity' }]
    expect(validateConfig(c)).toMatch(/calendars/)
  })

  it('allows list rows with a null entity (unassigned row)', () => {
    const c = example()
    c.tasks = [{ name: 'Person A', entity: null }]
    expect(validateConfig(c)).toBeNull()
  })

  it('rejects malformed smartHome sections, including mediaPlayers', () => {
    const c = example()
    c.smartHome = { mediaPlayers: [{ entity: 'media_player.x' }] } // missing name
    expect(validateConfig(c)).toMatch(/mediaPlayers/)
    c.smartHome = ['nope']
    expect(validateConfig(c)).toMatch(/smartHome/)
  })

  it('validates dashboard tiles', () => {
    const c = example()
    c.dashboard = { tiles: [{ id: 'calendar', x: 0, y: 0, w: 'wide', h: 1 }] }
    expect(validateConfig(c)).toMatch(/tiles/)
  })

  it('validates airQuality shape', () => {
    const c = example()
    c.airQuality = { name: 'no entity' }
    expect(validateConfig(c)).toMatch(/airQuality/)
  })

  it('ignores unknown keys so the schema can grow', () => {
    const c = example()
    c.someFutureFeature = { anything: true }
    expect(validateConfig(c)).toBeNull()
  })

  it('accepts a frigate section with camera names', () => {
    const c = example()
    c.frigate = { cameras: ['front_door'], refreshSeconds: 5 }
    expect(validateConfig(c)).toBeNull()
  })

  it('rejects a frigate camera list that is not strings', () => {
    const c = example()
    c.frigate = { cameras: [{ name: 'front_door' }] }
    expect(validateConfig(c)).toMatch(/frigate.cameras/)
  })

  it('rejects non-positive frigate intervals', () => {
    const c = example()
    c.frigate = { pollSeconds: 0 }
    expect(validateConfig(c)).toMatch(/pollSeconds/)
  })
})
