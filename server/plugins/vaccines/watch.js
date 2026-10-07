import { seasonLabel, seasonStartYear } from './sources.js'

const REFRESH_MS = 2 * 60 * 60_000
const FAILING_AFTER_MS = 24 * 60 * 60_000

/**
 * Asks every source at most every two hours; the campaign is open as soon as one says so.
 * A source that keeps failing for a day is reported, so a broken check never looks like "not yet".
 */
export function createCampaignWatch({ sources, now = () => new Date() }) {
  const failingSince = {}
  let cached = null
  let pending = null

  async function ask(name, check, year) {
    try {
      const result = await check(year)
      delete failingSince[name]
      return result
    } catch (e) {
      failingSince[name] ??= now().getTime()
      return { state: 'error', error: e.message }
    }
  }

  async function refresh() {
    const date = now()
    const year = seasonStartYear(date)
    const results = Object.fromEntries(await Promise.all(
      Object.entries(sources).map(async ([name, check]) => [name, await ask(name, check, year)])))
    const status = {
      season: seasonLabel(year),
      open: Object.values(results).some((r) => r.state === 'open'),
      failing: Object.keys(failingSince).filter((name) => date.getTime() - failingSince[name] >= FAILING_AFTER_MS),
      sources: results,
      checkedAt: date.toISOString(),
    }
    cached = { at: date.getTime(), status }
    return status
  }

  return {
    status() {
      if (cached && now().getTime() - cached.at < REFRESH_MS) return Promise.resolve(cached.status)
      pending ??= refresh().finally(() => { pending = null })
      return pending
    },
  }
}
