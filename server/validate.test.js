import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { validateConfig } from './validate.js'

const example = () => JSON.parse(readFileSync(new URL('../config/config.example.json', import.meta.url), 'utf8'))

const withPlugin = (id, settings) => ({ ...example(), plugins: { [id]: { enabled: true, ...settings } } })

describe('validateConfig', () => {
  it('accepts the shipped example config', () => {
    expect(validateConfig(example())).toBeNull()
  })

  it('accepts an empty config, so a fresh install starts from nothing', () => {
    expect(validateConfig({})).toBeNull()
  })

  it('rejects non-objects', () => {
    expect(validateConfig(null)).toMatch(/JSON object/)
    expect(validateConfig([])).toMatch(/JSON object/)
    expect(validateConfig('{}')).toMatch(/JSON object/)
  })

  it('rejects a weatherEntity that is not a string', () => {
    expect(validateConfig({ weatherEntity: 42 })).toMatch(/weatherEntity/)
  })

  it('rejects malformed calendars', () => {
    expect(validateConfig({ calendars: [{ name: 'no entity' }] })).toMatch(/calendars/)
  })

  it('allows list rows with a null entity (unassigned row)', () => {
    expect(validateConfig({ tasks: [{ name: 'Alex', entity: null }] })).toBeNull()
  })

  it('names the malformed list section', () => {
    expect(validateConfig({ rewards: [{ entity: 'counter.x' }] })).toMatch(/^rewards/)
  })

  it('rejects malformed smartHome sections, including mediaPlayers', () => {
    expect(validateConfig({ smartHome: { mediaPlayers: [{ entity: 'media_player.x' }] } })).toMatch(/mediaPlayers/)
    expect(validateConfig({ smartHome: ['nope'] })).toMatch(/smartHome/)
  })

  it('validates dashboard tiles', () => {
    expect(validateConfig({ dashboard: { tiles: [{ id: 'calendar', x: 0, y: 0, w: 'wide', h: 1 }] } })).toMatch(/tiles/)
  })

  it('ignores unknown keys and unknown plugins so the schema can grow', () => {
    expect(validateConfig({ someFutureFeature: { anything: true } })).toBeNull()
    expect(validateConfig({ plugins: { notYetWritten: { enabled: true } } })).toBeNull()
  })

  it('requires plugin settings to be objects with a boolean enabled flag', () => {
    expect(validateConfig({ plugins: { hockey: 'on' } })).toMatch(/plugins\.hockey/)
    expect(validateConfig({ plugins: { hockey: { enabled: 'yes' } } })).toMatch(/plugins\.hockey\.enabled/)
  })

  it("runs each plugin's own validation", () => {
    expect(validateConfig(withPlugin('hockey', { team: 8 }))).toMatch(/plugins\.hockey: team/)
    expect(validateConfig(withPlugin('frigate', { cameras: [{ name: 'front_door' }] }))).toMatch(/plugins\.frigate: cameras/)
    expect(validateConfig(withPlugin('frigate', { pollSeconds: 0 }))).toMatch(/pollSeconds/)
    expect(validateConfig(withPlugin('expensave', { calendars: [{ name: 'no id' }] }))).toMatch(/plugins\.expensave: calendars/)
    expect(validateConfig(withPlugin('airQuality', { safeMax: 'low' }))).toMatch(/safeMax/)
    expect(validateConfig(withPlugin('garbage', { collections: [{ entity: 'sensor.x' }] }))).toMatch(/collections/)
  })

  it('accepts an enabled plugin before it is set up', () => {
    expect(validateConfig(withPlugin('hockey', {}))).toBeNull()
    expect(validateConfig(withPlugin('frigate', { cameras: ['front_door'], refreshSeconds: 5 }))).toBeNull()
  })
})
