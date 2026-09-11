import { describe, expect, it } from 'vitest'
import { groupByDay, moneyRange, savingsPlan, startOfWeek, weeklyMoney } from './expensave'
import type { MoneyDay, Transaction } from './types'

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
