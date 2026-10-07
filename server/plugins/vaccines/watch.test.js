import { describe, expect, it } from 'vitest'
import { createCampaignWatch } from './watch.js'

const HOUR = 60 * 60_000

function setup(sources) {
  let time = new Date(2026, 9, 7, 12).getTime()
  const watch = createCampaignWatch({ sources, now: () => new Date(time) })
  return { watch, advance: (ms) => { time += ms } }
}

describe('createCampaignWatch', () => {
  it('is open as soon as one source says so', async () => {
    const { watch } = setup({ clicSante: async () => ({ state: 'missing' }), quebec: async () => ({ state: 'open' }) })
    expect(await watch.status()).toMatchObject({ season: '2026-2027', open: true, failing: [] })
  })

  it('asks the sources at most every two hours', async () => {
    let calls = 0
    const { watch, advance } = setup({ quebec: async () => { calls++; return { state: 'closed' } } })
    await watch.status()
    advance(HOUR)
    await watch.status()
    expect(calls).toBe(1)
    advance(HOUR)
    await watch.status()
    expect(calls).toBe(2)
  })

  it('reports a source only after it has failed for a day, and forgets once it recovers', async () => {
    let broken = true
    const { watch, advance } = setup({
      clicSante: async () => ({ state: 'closed' }),
      quebec: async () => { if (broken) throw new Error('HTTP 500'); return { state: 'closed' } },
    })
    expect(await watch.status()).toMatchObject({ failing: [], sources: { quebec: { state: 'error', error: 'HTTP 500' } } })
    advance(24 * HOUR)
    expect((await watch.status()).failing).toEqual(['quebec'])
    broken = false
    advance(2 * HOUR)
    expect((await watch.status()).failing).toEqual([])
  })
})
