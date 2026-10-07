import { describe, expect, it } from 'vitest'
import { createEntityFilter, entityIdsIn } from './liveUpdates.js'

describe('entityIdsIn', () => {
  it('collects entity ids anywhere in the config, plugins included', () => {
    const ids = entityIdsIn({
      locale: 'fr-CA',
      smartHome: { climate: 'climate.thermostat', lights: [{ name: 'Kitchen', entity: 'light.kitchen' }] },
      plugins: { hockey: { enabled: true, entity: 'sensor.nhl_mtl' } },
    })
    expect([...ids].sort()).toEqual(['climate.thermostat', 'light.kitchen', 'sensor.nhl_mtl'])
  })
})

describe('createEntityFilter', () => {
  const store = (config) => ({ tryRead: () => config, onChange: () => {} })

  it('lets core domains and configured entities through', () => {
    const isRelevant = createEntityFilter(store({ smartHome: { climate: 'climate.thermostat' } }))
    expect(isRelevant('todo.groceries')).toBe(true)
    expect(isRelevant('sun.sun')).toBe(true)
    expect(isRelevant('climate.thermostat')).toBe(true)
    expect(isRelevant('sensor.unrelated')).toBe(false)
  })
})
