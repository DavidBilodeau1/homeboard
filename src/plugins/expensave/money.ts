import { addDays, dayKey, monthGrid, startOfMonth } from '../../util'
import type { BankImportStatus, BankPreview, DayMoney, Everyday, ExpensaveCalendar, ExpensaveSettings, MoneyDay, MoneyWeek, SavingsPlan, Transaction } from './types'

// Sign convention is Expensave's: income is positive, spending negative.

export const DEFAULT_HORIZON_DAYS = 14
export const DEFAULT_CURRENCY = 'CAD'
export const DEFAULT_IMPORT_EVERY_DAYS = 14
/** Statement weeks the everyday-spending estimate looks back over; it needs at least two. */
export const EVERYDAY_WEEKS = 6
const MIN_EVERYDAY_WEEKS = 2
const DAY_MS = 86_400_000

const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / DAY_MS)

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
const median = (list: number[]) => {
  const sorted = [...list].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
const fromBank = (t: Transaction) => t.kind === 'bank' || t.kind === 'matched' || t.kind === 'transfer'

/** Last day the imported bank statements cover, or null before the first import. */
export function statementDate(transactions: Transaction[]): string | null {
  return transactions.filter(fromBank).reduce<string | null>((last, t) => (!last || t.date > last ? t.date : last), null)
}

const unplannedOut = (transactions: Transaction[], from: string, to: string) =>
  -sum(transactions.filter((t) => t.kind === 'bank' && t.amount < 0 && t.date >= from && t.date <= to).map((t) => t.amount))

/**
 * Usual everyday spending: what left the account that no plan entry announced — purchases, Interac transfers to
 * people, cash — but not moves between your own accounts. The median of the last full statement weeks, so one big
 * purchase doesn't swing it.
 */
export function everydaySpending(transactions: Transaction[]): Everyday | null {
  const through = statementDate(transactions)
  if (!through) return null
  const first = transactions.filter(fromBank).reduce((min, t) => (t.date < min ? t.date : min), through)
  const end = new Date(`${through}T00:00:00`)
  const weeks: number[] = []
  for (let i = 0; i < EVERYDAY_WEEKS; i++) {
    const start = dayKey(addDays(end, -7 * i - 6))
    const last = dayKey(addDays(end, -7 * i))
    // only weeks the statements fully cover: an earlier week would look cheap
    if (start < first) break
    weeks.push(unplannedOut(transactions, start, last))
  }
  if (weeks.length < MIN_EVERYDAY_WEEKS) return null
  const perWeek = round2(median(weeks))
  return { perDay: round2(perWeek / 7), perWeek, weeks: weeks.length, source: 'statements' }
}

/** Everyday spending per day over the last `days` the statements cover — how the target is holding. */
export function recentSpending(transactions: Transaction[], days: number): number | null {
  const through = statementDate(transactions)
  if (!through) return null
  const from = dayKey(addDays(new Date(`${through}T00:00:00`), 1 - days))
  if (!transactions.some((t) => fromBank(t) && t.date <= from)) return null
  return round2(unplannedOut(transactions, from, through) / days)
}

/** Walks the balance day by day to the horizon; a day's spending and bills go out before its income comes in. */
function walk(start: number, byDay: Map<string, number[]>, perDay: number, today: Date, horizonDays: number) {
  let running = start
  let low = start
  let lowDate = dayKey(today)
  for (let i = 1; i <= horizonDays; i++) {
    const day = dayKey(addDays(today, i))
    for (const amount of [-perDay, ...(byDay.get(day) ?? [])].sort((a, b) => a - b)) {
      running = round2(running + amount)
      if (running < low) {
        low = running
        lowDate = day
      }
    }
  }
  return { low, lowDate, end: running }
}

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
 * Everyday spending is taken out day by day, including the days since the last statement — at the daily target
 * when one is set (spend less, set more aside), else at the usual pace.
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

  const usual = everydaySpending(transactions)
  const target = cfg?.dailyTarget
  const everyday: Everyday | null = target != null
    ? { perDay: target, perWeek: round2(target * 7), weeks: 0, source: 'target' }
    : usual
  const perDay = everyday?.perDay ?? 0
  const statement = statementDate(transactions)
  const statementAge = statement ? Math.max(0, daysBetween(statement, todayKey)) : null
  const spentSince = round2(perDay * (statementAge ?? 0))

  const byDay = new Map<string, number[]>()
  for (const t of commitments) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t.amount])
  const startAt = (pace: number) => round2(balance + uncleared - pace * (statementAge ?? 0))

  const { low, lowDate, end: projected } = walk(startAt(perDay), byDay, perDay, today, horizonDays)
  const available = round2(low - buffer)
  const setAside = Math.max(0, available)
  // the target is a promise: show where the usual pace would leave the account once the money has moved
  const atUsual = target != null && usual ? walk(startAt(usual.perDay), byDay, usual.perDay, today, horizonDays) : null

  return {
    balance,
    statementDate: statement,
    statementAge,
    everyday,
    usual,
    usualLow: atUsual ? round2(atUsual.low - setAside) : null,
    usualLowDate: atUsual?.lowDate ?? null,
    spentSince,
    everydayAhead: round2(perDay * horizonDays),
    uncleared,
    upcomingIn,
    upcomingOut,
    low,
    lowDate,
    projected,
    buffer,
    horizonDays,
    horizonEnd,
    setAside,
    shortfall: available < 0 ? round2(-available) : 0,
    commitments,
    unclearedCount: unclearedRows.length,
  }
}

/** What the Money page expected for a statement's last day: the previous bank balance, the plan, everyday spending. */
export function statementForecast(preview: Pick<BankPreview, 'balanceFrom' | 'plannedSince' | 'to'>, perDay: number): number | null {
  if (!preview.balanceFrom || preview.plannedSince == null) return null
  return round2(preview.balanceFrom.balance + preview.plannedSince - perDay * daysBetween(preview.balanceFrom.date, preview.to))
}

/** "1 234,56", "1,234.56", "$1234.5" → 1234.56; null when it is not a number. */
export function parseAmount(text: string): number | null {
  const compact = text.replace(/[\s$\u00a0]/g, '')
  if (!compact) return null
  const decimalComma = /,\d{1,2}$/.test(compact)
  const value = Number(decimalComma ? compact.replace(/\./g, '').replace(',', '.') : compact.replace(/,/g, ''))
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null
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
