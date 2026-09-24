/**
 * Demo ledger used when HomeBoard runs in mock mode (no Expensave configured).
 *
 * It answers with the same payloads Expensave's own API returns, so everything
 * downstream — normalisation, the calendar layer, the weekly savings math —
 * runs through exactly the same code path as with a real instance.
 *
 * The ledger is deterministic (seeded from the date) and anchored on today, so
 * the demo always has a believable past, a current week and upcoming bills.
 */

const DAY = 86_400_000
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const at = (d, h, m) => `${key(d)} ${pad(h)}:${pad(m)}:00`
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const round2 = (v) => Math.round(v * 100) / 100

/** Stable 0..1 from a string — same day always gets the same amount. */
function seeded(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}
const jitter = (s, min, max) => round2(min + seeded(s) * (max - min))

const CATEGORIES = {
  salary: { id: 1, name: 'Salary', color: '#4caf50' },
  housing: { id: 2, name: 'Housing', color: '#6687e7' },
  utilities: { id: 3, name: 'Utilities', color: '#00b8d4' },
  groceries: { id: 4, name: 'Groceries', color: '#7cb342' },
  eatingOut: { id: 5, name: 'Eating out', color: '#da4040' },
  transport: { id: 6, name: 'Car & Transportation', color: '#f9a825' },
  kids: { id: 7, name: 'Kids', color: '#d34d81' },
  fun: { id: 8, name: 'Entertainment', color: '#8e6cd6' },
  savings: { id: 9, name: 'Savings', color: '#2e9e8f' },
}
for (const c of Object.values(CATEGORIES)) c.type = 'user'
const BALANCE_CATEGORY = { id: 99, name: 'Balance update', color: '#24485d', type: 'balance_update' }

/** Payday: every second Friday, anchored so the cadence never drifts. */
const PAY_ANCHOR = Date.UTC(2024, 0, 5) // a Friday
const isPayday = (d) => d.getDay() === 5 &&
  Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - PAY_ANCHOR) / DAY) % 14 === 0

/** [calendarId, rule] pairs: one household calendar, one personal one. */
const RULES = {
  1: (d) => {
    const out = []
    const k = key(d)
    if (isPayday(d)) {
      out.push({ h: 8, label: 'Paycheque', amount: 2150, cat: CATEGORIES.salary })
      out.push({ h: 8, label: 'To savings', amount: -500, cat: CATEGORIES.savings, recurring: 'biweekly' })
    }
    if (d.getDate() === 1) out.push({ h: 7, label: 'Mortgage', amount: -1485, cat: CATEGORIES.housing, recurring: 'monthly' })
    if (d.getDate() === 5) out.push({ h: 9, label: 'Internet', amount: -84.99, cat: CATEGORIES.utilities, recurring: 'monthly' })
    if (d.getDate() === 8) out.push({ h: 9, label: 'Hydro', amount: -jitter(`hydro${k}`, 92, 164), cat: CATEGORIES.utilities, recurring: 'monthly' })
    if (d.getDate() === 18) out.push({ h: 9, label: 'Phone plan', amount: -71.5, cat: CATEGORIES.utilities, recurring: 'monthly' })
    if (d.getDay() === 6) out.push({ h: 11, label: 'Groceries', amount: -jitter(`groc${k}`, 118, 214), cat: CATEGORIES.groceries })
    if (d.getDay() === 1 && Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - PAY_ANCHOR) / DAY) % 14 === 3) {
      out.push({ h: 8, label: 'Daycare', amount: -312, cat: CATEGORIES.kids, recurring: 'biweekly' })
    }
    if (Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY) % 9 === 0) {
      out.push({ h: 17, label: 'Gas', amount: -jitter(`gas${k}`, 52, 88), cat: CATEGORIES.transport })
    }
    return out
  },
  2: (d) => {
    const out = []
    const k = key(d)
    if ([2, 4].includes(d.getDay())) out.push({ h: 8, label: 'Coffee', amount: -jitter(`cof${k}`, 4.25, 7.4), cat: CATEGORIES.eatingOut })
    if (d.getDay() === 5) out.push({ h: 19, label: 'Restaurant', amount: -jitter(`din${k}`, 26, 78), cat: CATEGORIES.eatingOut })
    if (d.getDate() === 22) out.push({ h: 10, label: 'Streaming', amount: -16.99, cat: CATEGORIES.fun, recurring: 'monthly' })
    if (d.getDate() === 15) out.push({ h: 14, label: 'Side gig', amount: 180, cat: CATEGORIES.salary })
    if (d.getDate() === 1) out.push({ h: 7, label: 'Allowance', amount: 250, cat: CATEGORIES.salary, recurring: 'monthly' })
    return out
  },
}

const CALENDARS = [
  { id: 1, name: 'Household', opening: 1250 },
  { id: 2, name: 'Personal', opening: 340 },
]

/** Whole ledger for one calendar: a year back, six months forward. */
function ledger(calendarId, today) {
  const rows = []
  let id = calendarId * 100000
  const todayKey = key(today)
  for (let i = -400; i <= 180; i++) {
    const d = addDays(today, i)
    for (const r of RULES[calendarId](d)) {
      rows.push({
        id: ++id,
        label: r.label,
        amount: round2(r.amount),
        // anything dated after today is still planned, exactly like Expensave's
        // own recurring entries: visible, but not in the balance yet
        confirmed: key(d) <= todayKey,
        description: null,
        category: r.cat,
        calendar: { id: calendarId },
        createdAt: at(d, r.h, 30),
        recurring: !!r.recurring,
        recurringFrequency: r.recurring ?? null,
      })
    }
  }
  return rows
}

export function expensaveMockApi(now = () => new Date()) {
  const ledgers = new Map()
  // writes (bank imports) live on top of the generated ledger, in memory
  const added = []
  const edits = new Map()
  const deleted = new Set()
  let nextId = 900000
  const rowsFor = (calendarId) => {
    const today = now()
    const cacheKey = `${calendarId}:${key(today)}`
    if (!ledgers.has(cacheKey)) ledgers.set(cacheKey, ledger(calendarId, today))
    return [...ledgers.get(cacheKey), ...added]
      .filter((r) => r.calendar.id === calendarId && !deleted.has(r.id))
      .map((r) => edits.get(r.id) ?? r)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
  const findRow = (id) => {
    for (const c of CALENDARS) {
      const hit = rowsFor(c.id).find((r) => r.id === Number(id))
      if (hit) return hit
    }
    throw new Error(`Expensave /expense/${id}: HTTP 404`)
  }
  const categoryOf = (ref) =>
    Object.values(CATEGORIES).find((c) => c.id === ref?.id) ?? { id: 15, name: 'Uncategorized', color: '#394852', type: 'uncategorized' }
  const fromBody = (b, base = {}) => ({
    ...base,
    label: b.label,
    amount: round2(b.amount),
    confirmed: b.confirmed !== false,
    description: b.description ?? null,
    category: categoryOf(b.category),
    calendar: { id: b.calendar.id },
    createdAt: String(b.createdAt).replace('T', ' ').slice(0, 19),
  })

  const balanceToDate = (calendarId, start) => {
    const cal = CALENDARS.find((c) => c.id === calendarId)
    return rowsFor(calendarId)
      .filter((r) => r.confirmed && r.createdAt.slice(0, 10) < start)
      .reduce((sum, r) => sum + r.amount, cal.opening)
  }

  return {
    async calendars() {
      const today = key(now())
      return CALENDARS.map((c) => ({
        id: c.id,
        name: c.name,
        owner: { id: 1, name: 'Demo', email: 'demo@example.com' },
        balance: round2(rowsFor(c.id).filter((r) => r.confirmed && r.createdAt.slice(0, 10) <= today)
          .reduce((sum, r) => sum + r.amount, c.opening)),
        shared: c.id === 1,
      }))
    },

    async categories() {
      return [...Object.values(CATEGORIES), { id: 15, name: 'Uncategorized', color: '#394852', type: 'uncategorized' }]
    },

    async suggest(label) {
      return CALENDARS.flatMap((c) => rowsFor(c.id)).reverse().find((r) => r.label.toLowerCase() === label.toLowerCase()) ?? null
    },

    async createExpense(body) {
      const row = fromBody(body, { id: ++nextId, recurring: false, recurringFrequency: null })
      added.push(row)
      return row
    },

    async updateExpense(id, body) {
      const row = fromBody(body, findRow(id))
      edits.set(row.id, row)
      return row
    },

    async deleteExpense(id) {
      findRow(id)
      deleted.add(Number(id))
      return null
    },

    async balanceUpdate(body) {
      const cal = CALENDARS.find((c) => c.id === body.calendar.id)
      const at = String(body.createdAt).replace('T', ' ').slice(0, 19)
      const soFar = rowsFor(cal.id).filter((r) => r.confirmed && r.createdAt < at).reduce((s, r) => s + r.amount, cal.opening)
      const row = {
        id: ++nextId, label: 'Balance Update', amount: round2(body.amount - soFar), confirmed: true,
        description: body.description ?? null, category: BALANCE_CATEGORY, calendar: { id: cal.id },
        createdAt: at, recurring: false, recurringFrequency: null,
      }
      added.push(row)
      return row
    },

    async expenses(calendarId, start, end) {
      const id = Number(calendarId)
      if (!RULES[id]) throw new Error(`Expensave /calendar/${calendarId}/expenses: HTTP 404`)
      const rows = rowsFor(id)
      const expenses = rows.filter((r) => {
        const day = r.createdAt.slice(0, 10)
        return day >= start && day <= end
      })

      // mirror Expensave's daily report: one row per day, confirmed money only
      const expenseBalances = []
      let running = balanceToDate(id, start)
      for (let d = new Date(`${start}T00:00:00`); key(d) <= end; d = addDays(d, 1)) {
        const day = key(d)
        const dayRows = expenses.filter((r) => r.confirmed && r.createdAt.slice(0, 10) === day)
        const income = dayRows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0)
        const expense = dayRows.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0)
        running += income + expense
        expenseBalances.push({
          balanceAt: `${day} 00:00:00`,
          income: round2(income),
          expense: round2(expense),
          change: round2(income + expense),
          balance: round2(running),
        })
      }

      const cal = CALENDARS.find((c) => c.id === id)
      return { expenses, expenseBalances, calendar: { id: cal.id, name: cal.name } }
    },
  }
}
