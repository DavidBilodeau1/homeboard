import { addDays, dayKey, monthGrid, startOfMonth } from './util'
import type {
  ExpensaveCalendar, ExpensaveCfg, MoneyDay, MoneyPayload, MoneyWeek, SavingsPlan, Transaction,
} from './types'

/**
 * Expensave client and the savings math behind the Money page.
 *
 * Everything comes from HomeBoard's own /api/expensave proxy (server/expensave.js),
 * so the browser never sees the Expensave host or its credentials.
 *
 * Sign convention is Expensave's: income is positive, spending negative.
 */

export const DEFAULT_HORIZON_DAYS = 14
export const DEFAULT_CURRENCY = 'CAD'

/** Colors handed to Expensave calendars that have none set in config. */
const FALLBACK_COLORS = ['#2e9e8f', '#8e6cd6', '#d98324', '#4a7dd6']

const json = async (r: Response) => {
  if (!r.ok) {
    const body = await r.json().catch(() => null)
    throw new Error(body?.error ?? `HTTP ${r.status}`)
  }
  return r.json()
}

export const getExpensaveCalendars = (): Promise<ExpensaveCalendar[]> =>
  fetch('/api/expensave/calendars').then(json)

export const getExpensaveRange = (ids: number[], start: string, end: string): Promise<MoneyPayload> =>
  fetch(`/api/expensave/expenses?calendars=${ids.join(',')}&start=${start}&end=${end}`).then(json)

// ---------- config helpers ----------
export const calendarColor = (cfg: ExpensaveCfg | undefined, id: number, index = 0): string =>
  cfg?.calendars?.find((c) => c.id === id)?.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]

export const calendarName = (cfg: ExpensaveCfg | undefined, cal: ExpensaveCalendar): string =>
  cfg?.calendars?.find((c) => c.id === cal.id)?.name || cal.name

/** Layer id used by the calendar's show/hide toggles. */
export const layerId = (id: number) => `expensave:${id}`

// ---------- dates ----------
/** Sunday-based, to line up with the month grid. */
export const startOfWeek = (d: Date) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -d.getDay())

/**
 * One fetch feeds every view, so ask for the union of what they need: the
 * displayed month grid, enough past weeks to show a trend, and far enough
 * ahead to cover both the next weeks and the commitment horizon.
 */
export function moneyRange(
  monthCursor: Date,
  today: Date,
  horizonDays = DEFAULT_HORIZON_DAYS,
  weeksBack = 7,
  weeksAhead = 4,
): { start: string; end: string } {
  const grid = monthGrid(startOfMonth(monthCursor))
  const week = startOfWeek(today)
  const starts = [grid[0], addDays(week, -7 * weeksBack)]
  const ends = [grid[41], addDays(week, 7 * weeksAhead + 6), addDays(today, horizonDays)]
  return {
    start: dayKey(new Date(Math.min(...starts.map((d) => d.getTime())))),
    end: dayKey(new Date(Math.max(...ends.map((d) => d.getTime())))),
  }
}

// ---------- per-day aggregation (calendar layer) ----------
export interface DayMoney {
  date: string
  income: number
  expense: number
  net: number
  transactions: Transaction[]
}

/** Group transactions by local day, newest calendars first in insertion order. */
export function groupByDay(transactions: Transaction[]): Map<string, DayMoney> {
  const map = new Map<string, DayMoney>()
  for (const t of transactions) {
    const day = map.get(t.date) ?? { date: t.date, income: 0, expense: 0, net: 0, transactions: [] }
    if (t.amount >= 0) day.income += t.amount
    else day.expense += t.amount
    day.net += t.amount
    day.transactions.push(t)
    map.set(t.date, day)
  }
  for (const day of map.values()) {
    day.income = round2(day.income)
    day.expense = round2(day.expense)
    day.net = round2(day.net)
  }
  return map
}

const round2 = (v: number) => Math.round(v * 100) / 100
const sum = (list: number[]) => round2(list.reduce((a, b) => a + b, 0))

// ---------- weekly view ----------
/**
 * Week-by-week money in and out. Weeks run Sunday→Saturday like the calendar
 * grid. `pending` is the part that has not cleared yet, so a future week reads
 * as a projection rather than a fact.
 */
export function weeklyMoney(
  transactions: Transaction[],
  today: Date,
  weeksBack = 5,
  weeksAhead = 3,
): MoneyWeek[] {
  const thisWeek = startOfWeek(today)
  const todayKey = dayKey(today)
  const weeks: MoneyWeek[] = []
  for (let i = -weeksBack; i <= weeksAhead; i++) {
    const start = addDays(thisWeek, i * 7)
    const end = addDays(start, 6)
    const startKey = dayKey(start)
    const endKey = dayKey(end)
    const rows = transactions.filter((t) => t.date >= startKey && t.date <= endKey)
    weeks.push({
      start: startKey,
      end: endKey,
      income: sum(rows.filter((t) => t.amount > 0).map((t) => t.amount)),
      expense: sum(rows.filter((t) => t.amount < 0).map((t) => t.amount)),
      net: sum(rows.map((t) => t.amount)),
      pending: sum(rows.filter((t) => !t.confirmed).map((t) => t.amount)),
      count: rows.length,
      current: startKey <= todayKey && todayKey <= endKey,
      future: startKey > todayKey,
    })
  }
  return weeks
}

// ---------- the number this whole feature exists for ----------
/**
 * How much can actually be moved to savings right now.
 *
 * Start from the cleared balance, subtract charges that have not cleared, then
 * walk the ledger day by day to the horizon. The answer is the LOWEST the
 * account gets along the way, minus the buffer — not the balance at the end.
 * Tomorrow's rent and next week's paycheque are not interchangeable: money you
 * only have after payday cannot be set aside today.
 *
 * Never negative: if the commitments outrun the balance there is nothing to set
 * aside, and `shortfall` says by how much.
 */
export function savingsPlan(
  transactions: Transaction[],
  days: MoneyDay[],
  today: Date,
  cfg?: ExpensaveCfg,
): SavingsPlan {
  const horizonDays = cfg?.horizonDays ?? DEFAULT_HORIZON_DAYS
  const buffer = cfg?.buffer ?? 0
  const todayKey = dayKey(today)
  const horizonEnd = dayKey(addDays(today, horizonDays))

  // the running balance Expensave reports for today (confirmed money only)
  const cleared = [...days].reverse().find((d) => d.date <= todayKey)
  const balance = round2(cleared?.balance ?? 0)

  // spent but not cleared: gone in practice, just not reflected in the balance
  const unclearedRows = transactions.filter((t) => t.date <= todayKey && !t.confirmed)
  // dated after today — confirmed or not, none of it is in the balance yet
  const commitments = transactions
    .filter((t) => t.date > todayKey && t.date <= horizonEnd)
    .sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount)

  const uncleared = sum(unclearedRows.map((t) => t.amount))
  const upcomingIn = sum(commitments.filter((t) => t.amount > 0).map((t) => t.amount))
  const upcomingOut = sum(commitments.filter((t) => t.amount < 0).map((t) => t.amount))

  // walk the horizon; the trough is what actually limits what can leave today
  let running = round2(balance + uncleared)
  let low = running
  let lowDate = todayKey
  for (const t of commitments) {
    running = round2(running + t.amount)
    if (running < low) {
      low = running
      lowDate = t.date
    }
  }
  const projected = running
  const available = round2(low - buffer)

  return {
    balance,
    uncleared,
    upcomingIn,
    upcomingOut,
    low,
    lowDate,
    projected,
    buffer,
    horizonDays,
    horizonEnd,
    setAside: Math.max(0, available),
    shortfall: available < 0 ? round2(-available) : 0,
    commitments,
    unclearedCount: unclearedRows.length,
  }
}

// ---------- formatting ----------
export const currencyOf = (cfg?: ExpensaveCfg) => cfg?.currency || DEFAULT_CURRENCY

export const fmtMoney = (v: number, locale: string, currency: string, cents = true) =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    // "$12.40", not "CA$12.40": everything on this board is in one currency
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(v)

/** Compact amount for calendar chips: no cents, explicit sign. */
export const fmtChip = (v: number, locale: string, currency: string) =>
  `${v > 0 ? '+' : ''}${fmtMoney(v, locale, currency, false)}`

export const fmtWeekRange = (week: MoneyWeek, locale: string) => {
  const s = new Date(`${week.start}T00:00:00`)
  const e = new Date(`${week.end}T00:00:00`)
  const fmt = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
  return `${fmt.format(s)} – ${fmt.format(e)}`
}
