import type { Translate } from '../../i18n'
import { addDays, dayKey, monthGrid, startOfMonth } from '../../util'
import en from './en.json'
import fr from './fr.json'
import type {
  BankImportStatus, BankPreview, DayMoney, Everyday, ExpensaveCalendar, ExpensaveSettings, MoneyDay, MoneyWeek, SavingsPlan, SavingsTarget,
  TargetProgress, Transaction,
} from './types'

// Sign convention is Expensave's: income is positive, spending negative.

/** How far ahead to look when no payday is planned. */
export const DEFAULT_HORIZON_DAYS = 14
export const DEFAULT_CURRENCY = 'CAD'
export const DEFAULT_IMPORT_EVERY_DAYS = 14
/** Statement weeks the everyday pace averages over: recent, so a quieter stretch shows up quickly. It needs two. */
export const EVERYDAY_WEEKS = 3
const MIN_EVERYDAY_WEEKS = 2
/** A single unplanned payment this big is a one-off (a contractor, a gift, a big purchase): it says nothing about next week. */
export const ONE_OFF_MIN = 400
/** How far ahead the next payday is looked for; past it the window is `horizonDays`. */
export const PAY_LOOKAHEAD_DAYS = 35
/** Paycheques this few days apart (one Thursday, one Friday) make one payday. */
const PAY_GROUP_DAYS = 3
/** Income that reads like a paycheque: "Paye", "DÉPÔT DE PAIE", "Payroll", "Salaire", "Paycheque". */
const PAY_RE = /\bpa(?:ie|ye)\b|payroll|salaire|salary|pay ?cheque|paycheck/i
/** What the "I moved it" button names its row, in every language. */
const SAVED_LABELS = new Set([en['money.savedLabel'], fr['money.savedLabel']].map((s) => s.toLowerCase()))
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
  const ends = [grid[41], addDays(week, 7 * weeksAhead + 6), addDays(today, Math.max(horizonDays, PAY_LOOKAHEAD_DAYS))]
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
const fromBank = (t: Transaction) => t.kind === 'bank' || t.kind === 'matched' || t.kind === 'transfer'

/** Last day the imported bank statements cover, or null before the first import. */
export function statementDate(transactions: Transaction[]): string | null {
  return transactions.filter(fromBank).reduce<string | null>((last, t) => (!last || t.date > last ? t.date : last), null)
}

const unplannedOut = (transactions: Transaction[], from: string, to: string) =>
  -sum(transactions
    .filter((t) => t.kind === 'bank' && t.amount < 0 && t.amount > -ONE_OFF_MIN && t.date >= from && t.date <= to)
    .map((t) => t.amount))

/**
 * Recent everyday spending: what left the account that no plan entry announced — groceries, purchases, Interac
 * transfers to people, cash — but not moves between your own accounts, nor one-offs of ONE_OFF_MIN or more.
 * The average of the last full statement weeks, so a quieter stretch lowers it within a few weeks.
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
  const perWeek = round2(sum(weeks) / weeks.length)
  return { perDay: round2(perWeek / 7), perWeek, weeks: weeks.length }
}

const isPay = (t: Transaction) => t.amount > 0 && PAY_RE.test(`${t.label} ${t.description ?? ''}`)

/** First day of every payday in the window, oldest first; paycheques a day or two apart count once. */
export function paydays(transactions: Transaction[]): string[] {
  const dates = [...new Set(transactions.filter(isPay).map((t) => t.date))].sort()
  return dates.filter((d, i) => i === 0 || daysBetween(dates[i - 1], d) > PAY_GROUP_DAYS)
}

/** Money moved to your own accounts (a transfer back counts against it), and rows "I moved it" recorded. */
const isSavingsMove = (t: Transaction) =>
  t.kind === 'transfer' || ((t.kind === 'plan' || t.kind === 'matched') && SAVED_LABELS.has(t.label.trim().toLowerCase()))

/**
 * Most everyday spending per day, in whole dollars, that keeps the balance at or above `floor` on every day of the
 * window — the days since the statement included. Null when there is no day to spread it over.
 */
function maxPerDay(start: number, byDay: Map<string, number[]>, age: number, today: Date, horizonDays: number, floor: number) {
  let best = age > 0 ? (start - floor) / age : Infinity
  let running = start
  for (let i = 1; i <= horizonDays; i++) {
    const amounts = byDay.get(dayKey(addDays(today, i))) ?? []
    // the day's bills go out before its income comes in
    best = Math.min(best, (running + sum(amounts.filter((a) => a < 0)) - floor) / (age + i))
    running += sum(amounts)
  }
  return Number.isFinite(best) ? Math.floor(best) : null
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
 * What to move to savings now, and what that leaves for everyday spending until the next payday.
 *
 * With a goal per pay, the goal comes first: what is left of it once this pay's moves are counted, as long as the
 * bills before payday leave room for it. The cushion is advice: the daily allowance keeps it when it can, and the
 * recent pace shows where the account would bottom out. Without a goal, it's the most that keeps the cushion.
 *
 * The window ends on the next payday (its bills go out first, its paycheque closes the window), or after
 * `horizonDays` when none is planned. The low point matters, not the end balance: money arriving after payday
 * can't pay rent due before it.
 */
export function savingsPlan(
  transactions: Transaction[],
  days: MoneyDay[],
  today: Date,
  cfg?: ExpensaveSettings,
): SavingsPlan {
  const buffer = cfg?.buffer ?? 0
  const goal = cfg?.payGoal && cfg.payGoal > 0 ? cfg.payGoal : null
  const todayKey = dayKey(today)

  const pays = paydays(transactions)
  const lastPay = pays.filter((d) => d <= todayKey).at(-1) ?? null
  const nextPay = pays.find((d) => d > todayKey && daysBetween(todayKey, d) <= PAY_LOOKAHEAD_DAYS) ?? null
  const horizonEnd = nextPay ?? dayKey(addDays(today, cfg?.horizonDays ?? DEFAULT_HORIZON_DAYS))
  const horizonDays = daysBetween(todayKey, horizonEnd)
  const periodStart = lastPay ?? dayKey(addDays(today, -(cfg?.horizonDays ?? DEFAULT_HORIZON_DAYS)))

  const cleared = [...days].reverse().find((d) => d.date <= todayKey)
  const balance = round2(cleared?.balance ?? 0)

  const unclearedRows = transactions.filter((t) => t.date <= todayKey && !t.confirmed)
  const commitments = transactions
    .filter((t) => t.date > todayKey && t.date <= horizonEnd && !(t.date === nextPay && isPay(t)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount)

  const uncleared = sum(unclearedRows.map((t) => t.amount))
  const upcomingIn = sum(commitments.filter((t) => t.amount > 0).map((t) => t.amount))
  const upcomingOut = sum(commitments.filter((t) => t.amount < 0).map((t) => t.amount))

  const everyday = everydaySpending(transactions)
  const pace = everyday?.perDay ?? 0
  const statement = statementDate(transactions)
  const statementAge = statement ? Math.max(0, daysBetween(statement, todayKey)) : null
  const age = statementAge ?? 0

  const byDay = new Map<string, number[]>()
  for (const t of commitments) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t.amount])
  const start = round2(balance + uncleared)
  /** The window at `perDay` of everyday spending, once `out` has moved to savings today. */
  const at = (perDay: number, out: number) => walk(round2(start - perDay * age - out), byDay, perDay, today, horizonDays)

  const moved = round2(-sum(transactions.filter((t) => isSavingsMove(t) && t.date >= periodStart && t.date <= todayKey).map((t) => t.amount)))
  const remaining = goal == null ? 0 : Math.max(0, round2(goal - Math.max(0, moved)))
  // the most the bills before payday leave room for, if nothing else were spent
  const room = Math.max(0, at(0, 0).low)
  const setAside = goal == null ? Math.max(0, round2(at(pace, 0).low - buffer)) : Math.min(remaining, room)

  const { low, lowDate, end: projected } = at(pace, setAside)
  const keepCushion = maxPerDay(start - setAside, byDay, age, today, horizonDays, buffer)
  const allowance = keepCushion == null ? null
    : keepCushion >= 0 || buffer <= 0 ? { perDay: Math.max(0, keepCushion), floor: 'cushion' as const }
    : { perDay: Math.max(0, maxPerDay(start - setAside, byDay, age, today, horizonDays, 0) ?? 0), floor: 'zero' as const }

  return {
    balance,
    statementDate: statement,
    statementAge,
    everyday,
    spentSince: round2(pace * age),
    everydayAhead: round2(pace * horizonDays),
    uncleared,
    unclearedCount: unclearedRows.length,
    upcomingIn,
    upcomingOut,
    commitments,
    periodStart,
    lastPay,
    nextPay,
    horizonDays,
    horizonEnd,
    buffer,
    goal,
    moved,
    setAside,
    goalGap: goal == null ? 0 : round2(remaining - setAside),
    allowance,
    low,
    lowDate,
    projected,
  }
}

const DEFAULT_PAY_EVERY_DAYS = 14

/** Running balance at the end of `day`; null when the ledger doesn't reach back that far. */
const balanceAt = (days: MoneyDay[], day: string) => [...days].reverse().find((d) => d.date <= day)?.balance ?? null
const eve = (day: string) => dayKey(addDays(new Date(`${day}T00:00:00`), -1))
const movedBetween = (transactions: Transaction[], from: string, to: string) =>
  round2(-sum(transactions.filter((t) => isSavingsMove(t) && t.date >= from && t.date <= to).map((t) => t.amount)))

/**
 * What the last two complete pay periods freed, per pay: the balance from the eve of one payday to the eve of the
 * next, plus what moved to savings in between. Everything counts — bills, everyday spending, one-offs, other income —
 * so it's what that way of living leaves to save. Null until a complete period is in the window.
 */
export function freedPerPay(transactions: Transaction[], days: MoneyDay[], today: Date): number | null {
  const todayKey = dayKey(today)
  const bounds = paydays(transactions).filter((d) => d <= todayKey && balanceAt(days, eve(d)) != null).slice(-3)
  if (bounds.length < 2) return null
  let freed = 0
  for (let i = 1; i < bounds.length; i++) {
    const [from, to] = [bounds[i - 1], bounds[i]]
    freed += balanceAt(days, eve(to))! - balanceAt(days, eve(from))! + movedBetween(transactions, from, eve(to))
  }
  return round2(freed / (bounds.length - 1))
}

/**
 * Where each savings target stands. Progress is the balance you last entered plus, for the first target only, what
 * moved to your own accounts since that day — HomeBoard can't tell which account a move went to, so it can't split
 * moves between targets. The pace (what recent pay periods freed) goes to the first target too.
 */
export function targetsProgress(
  targets: SavingsTarget[],
  transactions: Transaction[],
  days: MoneyDay[],
  today: Date,
  windowStart: string,
): TargetProgress[] {
  const todayKey = dayKey(today)
  const pays = paydays(transactions)
  const lastPay = pays.filter((d) => d <= todayKey).at(-1) ?? null
  const every = pays.length >= 2 ? daysBetween(pays[pays.length - 2], pays[pays.length - 1]) : DEFAULT_PAY_EVERY_DAYS
  const anchor = new Date(`${lastPay ?? todayKey}T00:00:00`)
  const pace = freedPerPay(transactions, days, today)
  const movedThisPay = lastPay ? movedBetween(transactions, lastPay, todayKey) : 0

  return targets.map((target, i) => {
    const counts = i === 0 && !!target.balanceDate
    const since = target.balanceDate ? dayKey(addDays(new Date(`${target.balanceDate}T00:00:00`), 1)) : todayKey
    const movedSince = counts ? movedBetween(transactions, since, todayKey) : 0
    const saved = round2((target.balance ?? 0) + movedSince)
    let paysLeft = 0
    for (let k = 1; every > 0; k++) {
      const pay = dayKey(addDays(anchor, k * every))
      if (pay > target.date) break
      if (pay > todayKey) paysLeft++
    }
    const remaining = Math.max(0, round2(target.amount - saved))
    const projected = i === 0 && pace != null
      ? round2(saved + Math.max(0, pace - movedThisPay) + Math.max(0, pace) * paysLeft)
      : null
    return {
      target,
      saved,
      movedSince,
      // moves before the window are missing, so the balance needs entering again
      stale: counts && since < windowStart,
      paysLeft,
      remaining,
      perPay: target.date > todayKey ? round2(remaining / (paysLeft + 1)) : remaining,
      pace: i === 0 ? pace : null,
      projected,
    }
  })
}

/** What the Money page expected for a statement's last day: the previous bank balance, the plan, everyday spending. */
export function statementForecast(preview: Pick<BankPreview, 'balanceFrom' | 'plannedSince' | 'to'>, perDay: number): number | null {
  if (!preview.balanceFrom || preview.plannedSince == null) return null
  return round2(preview.balanceFrom.balance + preview.plannedSince - perDay * daysBetween(preview.balanceFrom.date, preview.to))
}

const shortDate = (day: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${day}T00:00:00`))

/** "until payday, Thu Nov 26", or until the window's last day when no payday is planned. */
export const untilLabel = (plan: Pick<SavingsPlan, 'nextPay' | 'horizonEnd'>, locale: string, t: Translate) =>
  plan.nextPay
    ? t('money.untilPay', { date: shortDate(plan.nextPay, locale) })
    : t('money.untilDate', { date: shortDate(plan.horizonEnd, locale) })

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
