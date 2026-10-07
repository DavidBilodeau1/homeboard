import { addDays, dayKey, monthGrid, startOfMonth } from '../../util'
import type { BankImportStatus, DayMoney, ExpensaveCalendar, ExpensaveSettings, MoneyDay, MoneyWeek, SavingsPlan, Transaction } from './types'

// Sign convention is Expensave's: income is positive, spending negative.

export const DEFAULT_HORIZON_DAYS = 14
export const DEFAULT_CURRENCY = 'CAD'
export const DEFAULT_IMPORT_EVERY_DAYS = 14
const DAY_MS = 86_400_000

/** Colors for Expensave calendars that have none set. */
const FALLBACK_COLORS = ['#2e9e8f', '#8e6cd6', '#d98324', '#4a7dd6']

/** When the next statement is due: `every` days after the last one ends; negative `days` when overdue. */
export function nextImportDue(last: BankImportStatus | null, today: Date, every = DEFAULT_IMPORT_EVERY_DAYS) {
  if (!last) return null
  const due = addDays(new Date(`${last.to}T00:00:00`), every)
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return { due: dayKey(due), days: Math.round((due.getTime() - midnight.getTime()) / DAY_MS) }
}

export const calendarColor = (cfg: ExpensaveSettings | undefined, id: number, index = 0): string =>
  cfg?.calendars?.find((c) => c.id === id)?.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]

export const calendarName = (cfg: ExpensaveSettings | undefined, cal: ExpensaveCalendar): string =>
  cfg?.calendars?.find((c) => c.id === cal.id)?.name || cal.name

/** Calendar layer id of an Expensave calendar. */
export const layerId = (id: number) => `expensave:${id}`

/** Sunday-based, to line up with the month grid. */
export const startOfWeek = (d: Date) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -d.getDay())

/** The one window every money view reads: the month grid, past weeks for the trend, and the horizon. */
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

/** Transactions grouped by local day. */
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

/** Money in and out per Sunday-to-Saturday week; `pending` marks what has not cleared yet. */
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

/**
 * How much can move to savings now: the lowest the balance gets before the horizon, minus the buffer.
 * The low point, not the end balance, because money arriving after payday can't pay rent due before it.
 */
export function savingsPlan(
  transactions: Transaction[],
  days: MoneyDay[],
  today: Date,
  cfg?: ExpensaveSettings,
): SavingsPlan {
  const horizonDays = cfg?.horizonDays ?? DEFAULT_HORIZON_DAYS
  const buffer = cfg?.buffer ?? 0
  const todayKey = dayKey(today)
  const horizonEnd = dayKey(addDays(today, horizonDays))

  const cleared = [...days].reverse().find((d) => d.date <= todayKey)
  const balance = round2(cleared?.balance ?? 0)

  const unclearedRows = transactions.filter((t) => t.date <= todayKey && !t.confirmed)
  const commitments = transactions
    .filter((t) => t.date > todayKey && t.date <= horizonEnd)
    .sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount)

  const uncleared = sum(unclearedRows.map((t) => t.amount))
  const upcomingIn = sum(commitments.filter((t) => t.amount > 0).map((t) => t.amount))
  const upcomingOut = sum(commitments.filter((t) => t.amount < 0).map((t) => t.amount))

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

export const currencyOf = (cfg?: ExpensaveSettings) => cfg?.currency || DEFAULT_CURRENCY

export const fmtMoney = (v: number, locale: string, currency: string, cents = true) =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    // "$12.40" rather than "CA$12.40": the board shows a single currency
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
