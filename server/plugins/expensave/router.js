import express from 'express'
import { importRouter } from './importRouter.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const CACHE_MS = 45_000
const CACHE_MAX_ENTRIES = 40

// Expensave serialises DateTimes as 'Y-m-d H:i:s' in the household's timezone.
const dayOf = (v) => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null)
const num = (v) => (Number.isFinite(v) ? Number(v) : 0)
const round2 = (v) => Math.round(v * 100) / 100

/** Income > 0, spending < 0. Unconfirmed rows are planned: not in the balance yet. */
const toTransaction = (e, calendarId) => ({
  id: e.id,
  calendar: calendarId,
  label: e.label ?? '',
  amount: num(e.amount),
  confirmed: e.confirmed !== false,
  description: e.description || null,
  category: e.category ? { id: e.category.id, name: e.category.name ?? '', color: e.category.color || null } : null,
  date: dayOf(e.createdAt),
  at: e.createdAt ?? null,
  recurring: !!e.recurring,
  frequency: e.recurringFrequency ?? null,
})

const toDay = (b) => ({
  date: dayOf(b.balanceAt),
  income: num(b.income),
  expense: num(b.expense),
  net: num(b.change),
  balance: num(b.balance),
})

const toCalendar = (c) => ({
  id: c.id,
  name: c.name ?? `#${c.id}`,
  balance: num(c.balance),
  shared: !!c.shared,
  owner: c.owner?.name ?? null,
})

/** Running balance on the latest day at or before `today`. */
export const balanceOn = (days, today) =>
  [...days].reverse().find((d) => d.date <= today)?.balance ?? null

/** Per-calendar day series summed into one household series. */
export function mergeDays(series) {
  const byDate = new Map()
  for (const day of series.flat()) {
    if (!day.date) continue
    const total = byDate.get(day.date) ?? { date: day.date, income: 0, expense: 0, net: 0, balance: 0 }
    for (const key of ['income', 'expense', 'net', 'balance']) total[key] += day[key]
    byDate.set(day.date, total)
  }
  return [...byDate.values()]
    .map((d) => ({ ...d, income: round2(d.income), expense: round2(d.expense), net: round2(d.net), balance: round2(d.balance) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function createCache() {
  const entries = new Map()
  const fresh = (entry) => Date.now() - entry.at < CACHE_MS
  const get = async (key, load) => {
    const hit = entries.get(key)
    if (hit && fresh(hit)) return hit.value
    const value = await load()
    entries.set(key, { at: Date.now(), value })
    if (entries.size > CACHE_MAX_ENTRIES) for (const [k, entry] of entries) if (!fresh(entry)) entries.delete(k)
    return value
  }
  return { get, clear: () => entries.clear() }
}

const parseIds = (text) =>
  String(text ?? '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0)

/** `opts.stateFile` remembers the last bank import; `opts.canWrite` is false on read-only panels. */
export function expensaveRouter(api, opts = {}) {
  const router = express.Router()
  const cache = createCache()
  const calendars = () => cache.get('calendars', () => api.calendars()).then((list) => (Array.isArray(list) ? list : []).map(toCalendar))

  router.use('/import', importRouter(api, { ...opts, onChange: cache.clear }))

  router.get('/calendars', async (_req, res) => {
    try {
      res.json(await calendars())
    } catch (e) {
      res.status(502).json({ error: e.message })
    }
  })

  const ledgerOf = async (calendar, start, end, today) => {
    try {
      const payload = await cache.get(`exp:${calendar.id}:${start}:${end}`, () => api.expenses(calendar.id, start, end))
      const days = (payload.expenseBalances ?? []).map(toDay).filter((d) => d.date)
      return {
        calendar: { ...calendar, balanceToday: balanceOn(days, today) },
        transactions: (payload.expenses ?? []).map((e) => toTransaction(e, calendar.id)).filter((t) => t.date),
        days,
        error: null,
      }
    } catch (e) {
      // one unreachable calendar must not blank out the others
      return { calendar: { ...calendar, balanceToday: null }, transactions: [], days: [], error: `${calendar.name}: ${e.message}` }
    }
  }

  router.get('/expenses', async (req, res) => {
    const { start, end } = req.query
    if (!DATE_RE.test(start ?? '') || !DATE_RE.test(end ?? '')) {
      return res.status(400).json({ error: 'start and end must be YYYY-MM-DD' })
    }
    if (start > end) return res.status(400).json({ error: 'start must be on or before end' })

    try {
      const all = await calendars()
      const wanted = parseIds(req.query.calendars)
      const selected = wanted.length ? all.filter((c) => wanted.includes(c.id)) : all
      const localToday = new Date().toLocaleDateString('en-CA')
      const today = localToday > end ? end : localToday
      const ledgers = await Promise.all(selected.map((c) => ledgerOf(c, start, end, today)))
      res.json({
        start,
        end,
        calendars: ledgers.map((l) => l.calendar),
        transactions: ledgers.flatMap((l) => l.transactions).sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '')),
        days: mergeDays(ledgers.map((l) => l.days)),
        errors: ledgers.map((l) => l.error).filter(Boolean),
      })
    } catch (e) {
      res.status(502).json({ error: e.message })
    }
  })

  return router
}
