import { describe, expect, it } from 'vitest'
import { everydaySpending, groupByDay, moneyRange, parseAmount, savingsPlan, startOfWeek, statementForecast, weeklyMoney } from './money'
import type { MoneyDay, Transaction, TransactionKind } from './types'

const TODAY = new Date(2026, 8, 10) // Thursday 2026-09-10

const txn = (date: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: Math.random(),
  calendar: 1,
  label: 'x',
  amount,
  confirmed: true,
  description: null,
  category: null,
  date,
  at: `${date} 12:00:00`,
  kind: 'plan',
  recurring: false,
  frequency: null,
  ...extra,
})

/** Running confirmed balance, the way Expensave's daily report reports it. */
const daysUpTo = (last: string, balance: number): MoneyDay[] =>
  [{ date: last, income: 0, expense: 0, net: 0, balance }]

describe('startOfWeek', () => {
  it('snaps back to Sunday like the month grid does', () => {
    expect(startOfWeek(TODAY).getDay()).toBe(0)
    expect(startOfWeek(TODAY).getDate()).toBe(6)
    // already a Sunday: unchanged
    expect(startOfWeek(new Date(2026, 8, 6)).getDate()).toBe(6)
  })
})

describe('moneyRange', () => {
  it('covers the month grid, the weekly trend and the commitment horizon', () => {
    const { start, end } = moneyRange(new Date(2026, 8, 1), TODAY, 14)
    expect(start <= '2026-07-23').toBe(true)   // 7 weeks before this week
    expect(end >= '2026-10-10').toBe(true)     // 4 weeks ahead covers the horizon
  })

  it('stretches when a long horizon reaches past the weeks ahead', () => {
    const { end } = moneyRange(new Date(2026, 8, 1), TODAY, 90)
    expect(end >= '2026-12-09').toBe(true)
  })
})

describe('groupByDay', () => {
  it('splits income from spending and keeps the rows', () => {
    const byDay = groupByDay([
      txn('2026-09-10', 2000),
      txn('2026-09-10', -120.5),
      txn('2026-09-11', -40),
    ])
    expect(byDay.get('2026-09-10')).toMatchObject({ income: 2000, expense: -120.5, net: 1879.5 })
    expect(byDay.get('2026-09-10')!.transactions).toHaveLength(2)
    expect(byDay.get('2026-09-11')!.net).toBe(-40)
    expect(byDay.has('2026-09-12')).toBe(false)
  })
})

describe('weeklyMoney', () => {
  const rows = [
    txn('2026-09-07', 1500),            // this week, cleared
    txn('2026-09-08', -200),            // this week, cleared
    txn('2026-09-12', -300, { confirmed: false }), // this week, still planned
    txn('2026-09-01', -50),             // last week
    txn('2026-09-15', -80, { confirmed: false }),  // next week
  ]

  it('buckets Sunday→Saturday and flags the current week', () => {
    const weeks = weeklyMoney(rows, TODAY, 1, 1)
    expect(weeks.map((w) => w.start)).toEqual(['2026-08-30', '2026-09-06', '2026-09-13'])
    const current = weeks.find((w) => w.current)!
    expect(current.start).toBe('2026-09-06')
    expect(current.income).toBe(1500)
    expect(current.expense).toBe(-500)
    expect(current.net).toBe(1000)
    expect(current.count).toBe(3)
  })

  it('reports the not-yet-cleared part separately', () => {
    const current = weeklyMoney(rows, TODAY, 1, 1).find((w) => w.current)!
    expect(current.pending).toBe(-300)
  })

  it('marks weeks that have not started as future', () => {
    const weeks = weeklyMoney(rows, TODAY, 0, 1)
    expect(weeks.map((w) => w.future)).toEqual([false, true])
    expect(weeks[1].net).toBe(-80)
  })
})

describe('savingsPlan', () => {
  it('leaves only what survives the upcoming bills and the buffer', () => {
    const rows = [
      txn('2026-09-14', -900),   // rent, scheduled
      txn('2026-09-11', 2150),   // payday, scheduled
      txn('2026-09-30', -600),   // past the 14-day horizon: not counted
    ]
    const plan = savingsPlan(rows, daysUpTo('2026-09-10', 2480.15), TODAY, { buffer: 500, horizonDays: 14 })
    expect(plan.balance).toBe(2480.15)
    expect(plan.upcomingIn).toBe(2150)
    expect(plan.upcomingOut).toBe(-900)
    expect(plan.projected).toBe(3730.15)
    // the account never dips below today's balance here, so today is the limit
    expect(plan.low).toBe(2480.15)
    expect(plan.setAside).toBe(1980.15)
    expect(plan.shortfall).toBe(0)
    expect(plan.commitments.map((t) => t.date)).toEqual(['2026-09-11', '2026-09-14'])
  })

  it('never counts a paycheque that lands after the bill it would cover', () => {
    const rows = [
      txn('2026-09-12', -1800),  // rent, before payday
      txn('2026-09-18', 2150),   // payday
    ]
    const plan = savingsPlan(rows, daysUpTo('2026-09-10', 2000), TODAY, { buffer: 0, horizonDays: 14 })
    // ends the window at 2350, but dips to 200 on the 12th — that is the limit
    expect(plan.projected).toBe(2350)
    expect(plan.low).toBe(200)
    expect(plan.lowDate).toBe('2026-09-12')
    expect(plan.setAside).toBe(200)
  })

  it('subtracts charges that have not cleared yet', () => {
    const rows = [txn('2026-09-09', -120, { confirmed: false })]
    const plan = savingsPlan(rows, daysUpTo('2026-09-10', 1000), TODAY, { buffer: 0, horizonDays: 14 })
    expect(plan.uncleared).toBe(-120)
    expect(plan.unclearedCount).toBe(1)
    expect(plan.setAside).toBe(880)
  })

  it('never suggests setting money aside when the bills outrun the balance', () => {
    const rows = [txn('2026-09-12', -1800)]
    const plan = savingsPlan(rows, daysUpTo('2026-09-10', 1000), TODAY, { buffer: 200, horizonDays: 14 })
    expect(plan.setAside).toBe(0)
    expect(plan.shortfall).toBe(1000)
    expect(plan.lowDate).toBe('2026-09-12')
  })

  it('uses the most recent day at or before today for the balance', () => {
    const days: MoneyDay[] = [
      { date: '2026-09-09', income: 0, expense: 0, net: 0, balance: 900 },
      { date: '2026-09-10', income: 0, expense: 0, net: 0, balance: 1200 },
      { date: '2026-09-11', income: 0, expense: 0, net: 0, balance: 3350 }, // tomorrow: ignored
    ]
    expect(savingsPlan([], days, TODAY).balance).toBe(1200)
  })

  it('falls back to zero rather than NaN when there is no ledger yet', () => {
    const plan = savingsPlan([], [], TODAY, { buffer: 100 })
    expect(plan.balance).toBe(0)
    expect(plan.setAside).toBe(0)
    expect(plan.shortfall).toBe(100)
    expect(plan.horizonDays).toBe(14)
  })
})

const bank = (date: string, amount: number, kind: TransactionKind = 'bank') => txn(date, amount, { kind })

describe('everydaySpending', () => {
  // statements cover Aug 21 – Sep 10: weeks of 300, 700 (one big purchase) and 350 of unplanned spending
  const rows = [
    bank('2026-08-21', -100),
    bank('2026-08-25', -200),
    bank('2026-08-30', -200),
    bank('2026-09-01', -500),
    bank('2026-09-05', -350),
    bank('2026-09-06', -1000, 'transfer'), // to savings
    bank('2026-09-08', 2000),               // pay
    bank('2026-09-10', -900, 'matched'),    // a planned bill
    txn('2026-09-09', -80),                 // still a plan
  ]

  it('takes the median week of unplanned spending the statements fully cover', () => {
    expect(everydaySpending(rows)).toEqual({ perDay: 50, perWeek: 350, weeks: 3, source: 'statements' })
  })

  it('needs two full statement weeks', () => {
    expect(everydaySpending(rows.filter((t) => t.date >= '2026-09-01'))).toBe(null)
    expect(everydaySpending([txn('2026-09-09', -80)])).toBe(null)
  })

  it('lets the settings replace the estimate', () => {
    expect(everydaySpending(rows, { everydayPerWeek: 700 })).toMatchObject({ perDay: 100, source: 'settings' })
  })
})

describe('savingsPlan with everyday spending', () => {
  // statement through Sep 7, three days before TODAY; $10 a day of everyday spending
  const rows = [bank('2026-09-07', -20), txn('2026-09-12', -500), txn('2026-09-14', 1000)]
  const plan = savingsPlan(rows, daysUpTo('2026-09-10', 1000), TODAY, { horizonDays: 7, buffer: 0, everydayPerWeek: 70 })

  it('takes out what was likely spent since the statement', () => {
    expect(plan.statementDate).toBe('2026-09-07')
    expect(plan.statementAge).toBe(3)
    expect(plan.spentSince).toBe(30)
  })

  it('reserves everyday spending every day, before the day\'s income', () => {
    expect(plan.everydayAhead).toBe(70)
    expect(plan.low).toBe(430)
    expect(plan.lowDate).toBe('2026-09-14')
    expect(plan.projected).toBe(1400)
    expect(plan.setAside).toBe(430)
  })
})

describe('statementForecast', () => {
  it('starts from the last bank balance, adds the plan and takes out everyday spending', () => {
    const preview = { balanceFrom: { date: '2026-09-01', balance: 1000 }, plannedSince: -300, to: '2026-09-11' }
    expect(statementForecast(preview, 20)).toBe(500)
    expect(statementForecast({ ...preview, balanceFrom: null }, 20)).toBe(null)
  })
})

describe('parseAmount', () => {
  it('reads French and English amounts', () => {
    expect(parseAmount('1 234,56')).toBe(1234.56)
    expect(parseAmount('$1,234.5')).toBe(1234.5)
    expect(parseAmount('abc')).toBe(null)
  })
})
