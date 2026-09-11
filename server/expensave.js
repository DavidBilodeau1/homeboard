import express from 'express'
import { expensaveMockApi } from './expensaveMock.js'

/**
 * Expensave integration (https://github.com/algirdasc/expensave).
 *
 * Expensave keeps the household's transactions in one or more "calendars".
 * HomeBoard reads them so spending shows up next to the family calendar and so
 * the Money page can answer the only question that matters here: how much can
 * we move to savings this week without missing a bill?
 *
 * The browser never talks to Expensave directly — its URL and credentials stay
 * in this process:
 *
 *   GET /api/expensave/calendars                     the user's expense calendars
 *   GET /api/expensave/expenses?calendars&start&end  transactions + daily balances
 *
 * Expensave's own API (Symfony + JWT):
 *   POST /api/auth/login                              {email,password} -> {token,refreshToken}
 *   GET  /api/calendar                                [{id,name,balance,shared,owner}]
 *   GET  /api/calendar/{id}/expenses/{from}/{to}      {expenses,expenseBalances,calendar}
 *
 * Every request must carry `Content-Type: application/json` — Expensave rejects
 * anything else with a 400 "Invalid JSON format", GETs included.
 */

const EXPENSAVE_URL = (process.env.EXPENSAVE_URL || '').replace(/\/+$/, '').replace(/\/api$/, '')
const EXPENSAVE_EMAIL = process.env.EXPENSAVE_EMAIL || ''
const EXPENSAVE_PASSWORD = process.env.EXPENSAVE_PASSWORD || ''

export const EXPENSAVE_ENABLED = Boolean(EXPENSAVE_URL && EXPENSAVE_EMAIL && EXPENSAVE_PASSWORD)
export const expensaveTarget = EXPENSAVE_URL

// ---------- auth ----------
// Access tokens live 10 minutes and refresh tokens are single-use (firing two
// refreshes in parallel logs you out), so we simply log in again with the
// credentials we already hold — one round-trip every 10 minutes.
let session = { token: null, exp: 0 }
let pending = null

const jwtExpiry = (token) => {
  try {
    const [, body] = token.split('.')
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    return Number(claims.exp) * 1000 || 0
  } catch {
    return 0
  }
}

async function login() {
  let r
  try {
    r = await fetch(`${EXPENSAVE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: EXPENSAVE_EMAIL, password: EXPENSAVE_PASSWORD }),
    })
  } catch (e) {
    // DNS/TLS/refused: name the host, "fetch failed" on its own helps nobody
    throw new Error(`Expensave unreachable at ${EXPENSAVE_URL} (${e.cause?.code ?? e.message})`, { cause: e })
  }
  if (!r.ok) {
    throw new Error(r.status === 401
      ? 'Expensave login rejected — check EXPENSAVE_EMAIL/EXPENSAVE_PASSWORD'
      : `Expensave login failed: HTTP ${r.status}`)
  }
  const body = await r.json()
  const token = body.token ?? body.access_token
  if (!token) throw new Error('Expensave login returned no token')
  // expire a little early so a request never starts with a token about to die
  session = { token, exp: jwtExpiry(token) || Date.now() + 9 * 60_000 }
  return token
}

function authToken() {
  if (session.token && Date.now() < session.exp - 30_000) return Promise.resolve(session.token)
  // collapse concurrent logins into one (single-use refresh semantics upstream)
  pending ??= login().finally(() => { pending = null })
  return pending
}

async function eapi(path, retried = false) {
  const token = await authToken()
  const r = await fetch(`${EXPENSAVE_URL}/api${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
  })
  if ((r.status === 401 || r.status === 403) && !retried) {
    session = { token: null, exp: 0 }
    return eapi(path, true)
  }
  if (!r.ok) throw new Error(`Expensave ${path}: HTTP ${r.status}`)
  return r.json()
}

// ---------- normalisation ----------
// Expensave serialises every DateTime as 'Y-m-d H:i:s' in the server's own
// timezone, which is the household's — so the first 10 chars are the local day.
const dayOf = (v) => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null)
const num = (v) => (Number.isFinite(v) ? Number(v) : 0)
const round2 = (v) => Math.round(v * 100) / 100

/** One transaction. Amounts keep Expensave's sign: income > 0, spending < 0. */
const normTransaction = (e, calendarId) => ({
  id: e.id,
  calendar: calendarId,
  label: e.label ?? '',
  amount: num(e.amount),
  // unconfirmed rows are planned/pending: they are not in the balance yet but
  // they ARE money already spoken for
  confirmed: e.confirmed !== false,
  description: e.description || null,
  category: e.category ? { id: e.category.id, name: e.category.name ?? '', color: e.category.color || null } : null,
  date: dayOf(e.createdAt),
  at: e.createdAt ?? null,
  recurring: !!e.recurring,
  frequency: e.recurringFrequency ?? null,
})

/** One day of one calendar: confirmed money in/out and the running balance. */
const normDay = (b) => ({
  date: dayOf(b.balanceAt),
  income: num(b.income),
  expense: num(b.expense), // already negative
  net: num(b.change),
  balance: num(b.balance),
})

/** Running balance on the latest day at or before `today` (0 if none). */
export const balanceOn = (days, today) =>
  [...days].reverse().find((d) => d.date <= today)?.balance ?? null

/** Merge per-calendar day series into one household series. */
export function mergeDays(series) {
  const byDate = new Map()
  for (const day of series.flat()) {
    if (!day.date) continue
    const acc = byDate.get(day.date) ?? { date: day.date, income: 0, expense: 0, net: 0, balance: 0 }
    acc.income += day.income
    acc.expense += day.expense
    acc.net += day.net
    acc.balance += day.balance
    byDate.set(day.date, acc)
  }
  return [...byDate.values()]
    .map((d) => ({ ...d, income: round2(d.income), expense: round2(d.expense), net: round2(d.net), balance: round2(d.balance) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ---------- upstream calls (swapped for demo data in mock mode) ----------
const live = {
  calendars: () => eapi('/calendar'),
  expenses: (id, start, end) => eapi(`/calendar/${id}/expenses/${start}/${end}`),
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// a few seconds of caching keeps month flipping and the 5-minute dashboard
// refresh from hammering Expensave with identical queries
const CACHE_MS = 45_000
const cache = new Map()
const cached = async (key, fn) => {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value
  const value = await fn()
  cache.set(key, { at: Date.now(), value })
  if (cache.size > 40) for (const [k, v] of cache) if (Date.now() - v.at > CACHE_MS) cache.delete(k)
  return value
}

export function expensaveRouter(api) {
  const router = express.Router()

  const normCalendar = (c) => ({
    id: c.id,
    name: c.name ?? `#${c.id}`,
    balance: num(c.balance),
    shared: !!c.shared,
    owner: c.owner?.name ?? null,
  })

  router.get('/calendars', async (_req, res) => {
    try {
      const list = await cached('calendars', () => api.calendars())
      res.json((Array.isArray(list) ? list : []).map(normCalendar))
    } catch (e) {
      res.status(502).json({ error: e.message })
    }
  })

  router.get('/expenses', async (req, res) => {
    const { start, end } = req.query
    if (!DATE_RE.test(start ?? '') || !DATE_RE.test(end ?? '')) {
      return res.status(400).json({ error: 'start and end must be YYYY-MM-DD' })
    }
    if (start > end) return res.status(400).json({ error: 'start must be on or before end' })

    try {
      const all = (await cached('calendars', () => api.calendars())).map(normCalendar)
      const wanted = String(req.query.calendars ?? '')
        .split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0)
      // no explicit selection means "everything this account can see"
      const calendars = wanted.length ? all.filter((c) => wanted.includes(c.id)) : all
      // local day, clamped into the window so a past-only range still reports
      // the balance it ends on
      const localToday = new Date().toLocaleDateString('en-CA')
      const today = localToday > end ? end : localToday

      const results = await Promise.all(calendars.map(async (c) => {
        try {
          const payload = await cached(`exp:${c.id}:${start}:${end}`, () => api.expenses(c.id, start, end))
          const days = (payload.expenseBalances ?? []).map(normDay).filter((d) => d.date)
          return {
            calendar: { ...c, balanceToday: balanceOn(days, today) },
            transactions: (payload.expenses ?? []).map((e) => normTransaction(e, c.id)).filter((t) => t.date),
            days,
            error: null,
          }
        } catch (e) {
          // one unreachable calendar must not blank out the others
          return { calendar: { ...c, balanceToday: null }, transactions: [], days: [], error: `${c.name}: ${e.message}` }
        }
      }))

      res.json({
        start,
        end,
        calendars: results.map((r) => r.calendar),
        transactions: results.flatMap((r) => r.transactions).sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '')),
        days: mergeDays(results.map((r) => r.days)),
        errors: results.map((r) => r.error).filter(Boolean),
      })
    } catch (e) {
      res.status(502).json({ error: e.message })
    }
  })

  return router
}

const disabledRouter = () => {
  const router = express.Router()
  router.use((_req, res) => res.status(503).json({
    error: 'Expensave not configured — set EXPENSAVE_URL, EXPENSAVE_EMAIL and EXPENSAVE_PASSWORD',
  }))
  return router
}

/** Live router when Expensave is configured, the demo ledger in mock mode, and
 *  a "not configured" stub otherwise. */
export const expensave = (mock = false) =>
  EXPENSAVE_ENABLED ? expensaveRouter(live) : mock ? expensaveRouter(expensaveMockApi()) : disabledRouter()
