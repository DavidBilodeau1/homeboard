import type { PluginSettings } from '../../types'

/** How HomeBoard labels and colors one Expensave calendar. */
export interface ExpensaveCalendarCfg {
  id: number
  /** overrides the name Expensave gives the calendar */
  name?: string
  color?: string
}

export interface ExpensaveSettings extends PluginSettings {
  /** which calendars to pull; omit/empty to use every calendar on the account */
  calendars?: ExpensaveCalendarCfg[]
  /** ISO 4217 code used to format amounts */
  currency?: string
  /** how far ahead to count already-scheduled money (default 14 days) */
  horizonDays?: number
  /** cash that must stay in the account and is never set aside */
  buffer?: number
  /** optional weekly savings target, shown as progress on the Money page */
  weeklyGoal?: number
  /** show the transactions layer on the calendar by default (default true) */
  showInCalendar?: boolean
  /** how often a bank statement should be imported on the Money page (default 14 days) */
  importEveryDays?: number
  /** everyday spending to reserve per week; omit to estimate it from the bank statements */
  everydayPerWeek?: number
}

/** One bank statement line, as the import preview shows it. */
export interface BankRow {
  date: string
  amount: number
  /** description trimmed to the merchant ("SQ *CORNER BAKERY") */
  label: string
  /** the bank's full description */
  raw: string
  /** category a new row will get (Expensave's memory of the label, else a keyword guess) */
  category?: string | null
}

/** An Expensave entry the statement touches. */
export interface BankPlanned {
  id: number
  date: string
  label: string
  amount: number
  confirmed: boolean
  recurring: boolean
  category: string | null
  /** for entries the bank never saw: the suggested fate */
  action?: 'remove' | 'pending'
}

/** What the last import did — also drives the "next statement due" reminder. */
export interface BankImportStatus {
  at: string
  from: string
  to: string
  account: string
  calendar: number
  count: number
  matched: number
  added: number
  removed: number
  pending: number
  balance: number | null
  errors: number
  /** rows imported while pending that got their posted description */
  refreshed?: number
  /** rows earlier uploads wrote twice, removed */
  merged?: number
  /** statement rows missing from Expensave after the import (null when it could not be checked) */
  lost?: number | null
  /** what the Money page expected the balance to be on `to`, before this statement */
  forecast?: number | null
}

/** A charge that repeats on a rhythm but has no plan entry. */
export interface RecurringCharge {
  label: string
  amount: number
  every: 'week' | 'twoWeeks' | 'month'
  last: string
  count: number
}

/** Dry run of a statement upload. */
export interface BankPreview {
  from: string
  to: string
  count: number
  account: string
  accounts: string[]
  calendar: { id: number; name: string }
  matched: { entry: BankPlanned; rows: BankRow[] }[]
  added: BankRow[]
  /** rows imported while still pending, now with their posted description */
  refreshed: { entry: BankPlanned; row: BankRow }[]
  /** copies earlier uploads wrote twice; they get removed */
  twins: BankPlanned[]
  duplicates: number
  missing: (BankPlanned & { action: 'remove' | 'pending' })[]
  /** balance column of the export, when it has one */
  bankBalance: number | null
  /** Expensave's running balance at the end of the statement, today */
  expensaveBalance: number
  /** …and once the import is applied, before any balance correction */
  balanceAfter: number
  /** the bank balance `balanceAfter` counts from, when an earlier statement set one */
  balanceFrom: { date: string; balance: number } | null
  /** what the plan alone expected between `balanceFrom` and the statement's end; null when not knowable */
  plannedSince: number | null
  /** unplanned charges that look recurring */
  recurring: RecurringCharge[]
  /** days between the previous statement and this one that no upload covered */
  gapDays: number
  lastImport: BankImportStatus | null
  canWrite: boolean
}

export interface ExpensaveCalendar {
  id: number
  name: string
  /** Expensave's own total, which counts confirmed rows dated years ahead: not today's money */
  balance: number
  /** running balance on the latest day at or before today */
  balanceToday?: number | null
  shared: boolean
  owner: string | null
}

export interface TransactionCategory {
  id: number
  name: string
  color: string | null
}

/**
 * Where a transaction comes from: typed in Expensave (`plan`), a bank row that confirmed a plan entry (`matched`),
 * a bank row nothing planned (`bank`), a move between the household's own accounts (`transfer`), or a balance update.
 */
export type TransactionKind = 'plan' | 'matched' | 'bank' | 'transfer' | 'balance'

/** One transaction. Expensave's sign convention: income > 0, spending < 0. */
export interface Transaction {
  id: number
  /** Expensave calendar id */
  calendar: number
  label: string
  amount: number
  /** false = planned or not cleared yet, so not in the balance */
  confirmed: boolean
  description: string | null
  category: TransactionCategory | null
  /** local calendar day, YYYY-MM-DD */
  date: string
  at: string | null
  recurring: boolean
  frequency: string | null
  kind: TransactionKind
}

/** One day of the household ledger; `balance` counts confirmed money only. */
export interface MoneyDay {
  date: string
  income: number
  expense: number
  net: number
  balance: number
}

export interface MoneyPayload {
  start: string
  end: string
  calendars: ExpensaveCalendar[]
  transactions: Transaction[]
  days: MoneyDay[]
  errors: string[]
  /** false on read-only panels */
  canWrite: boolean
}

export interface MoneyWeek {
  start: string
  end: string
  income: number
  expense: number
  net: number
  /** part of `net` that has not cleared yet (a projection, not a fact) */
  pending: number
  count: number
  current: boolean
  future: boolean
}

/** Everyday spending HomeBoard reserves; see everydaySpending() in money.ts. */
export interface Everyday {
  perDay: number
  perWeek: number
  /** statement weeks behind the estimate; 0 when it comes from the settings */
  weeks: number
  source: 'statements' | 'settings'
}

/** What can safely move to savings today; see savingsPlan() in money.ts. */
export interface SavingsPlan {
  balance: number
  /** last day the bank statements cover; null before the first import */
  statementDate: string | null
  /** days from `statementDate` to today */
  statementAge: number | null
  everyday: Everyday | null
  /** everyday spending since the statement: gone from the account, not in the ledger yet */
  spentSince: number
  /** everyday spending reserved over the horizon */
  everydayAhead: number
  uncleared: number
  upcomingIn: number
  upcomingOut: number
  /** lowest the account gets between today and the horizon — the real limit */
  low: number
  lowDate: string
  /** balance once every commitment in the window has landed */
  projected: number
  buffer: number
  horizonDays: number
  horizonEnd: string
  setAside: number
  shortfall: number
  commitments: Transaction[]
  unclearedCount: number
}

export interface MoneyState {
  calendars: ExpensaveCalendar[]
  transactions: Transaction[]
  days: MoneyDay[]
  weeks: MoneyWeek[]
  plan: SavingsPlan
  byDay: Map<string, DayMoney>
  currency: string
  errors: string[]
  canWrite: boolean
}

export interface DayMoney {
  date: string
  income: number
  expense: number
  net: number
  transactions: Transaction[]
}
