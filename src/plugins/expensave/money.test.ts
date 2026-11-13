import { describe, expect, it } from 'vitest'
import {
  everydaySpending, freedPerPay, groupByDay, moneyRange, parseAmount, paydays, savingsPlan, startOfWeek, statementForecast,
  targetsProgress, weeklyMoney,
} from './money'
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
      txn('2026-09-11', 2150),   // income, scheduled
      txn('2026-09-30', -600),   // past the 14-day horizon: not counted
    ]
    const plan = savingsPlan(rows, daysUpTo('2026-09-10', 2480.15), TODAY, { buffer: 500, horizonDays: 14 })
    expect(plan.balance).toBe(2480.15)
    expect(plan.nextPay).toBe(null)
    expect(plan.horizonEnd).toBe('2026-09-24')
    expect(plan.upcomingIn).toBe(2150)
    expect(plan.upcomingOut).toBe(-900)
    // the account never dips below today's balance here, so today is the limit
    expect(plan.setAside).toBe(1980.15)
    expect(plan.low).toBe(500)
    expect(plan.projected).toBe(1750)
    expect(plan.commitments.map((t) => t.date)).toEqual(['2026-09-11', '2026-09-14'])
  })

  it('never counts income that lands after the bill it would cover', () => {
    const rows = [
      txn('2026-09-12', -1800),  // rent
      txn('2026-09-18', 2150),   // income, after rent
    ]
    const plan = savingsPlan(rows, daysUpTo('2026-09-10', 2000), TODAY, { buffer: 0, horizonDays: 14 })
    // the window ends at 2350, but dips to 200 on the 12th — that is the limit
    expect(plan.setAside).toBe(200)
    expect(plan.low).toBe(0)
    expect(plan.lowDate).toBe('2026-09-12')
    expect(plan.projected).toBe(2150)
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
    expect(plan.low).toBe(-800)
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
    expect(plan.low).toBe(0)
    expect(plan.horizonDays).toBe(14)
  })
})

const bank = (date: string, amount: number, kind: TransactionKind = 'bank', label = 'x') => txn(date, amount, { kind, label })

describe('everydaySpending', () => {
  // statements cover Aug 21 – Sep 10: weeks of 300, 200 (plus a 500 one-off) and 340 of unplanned spending
  const rows = [
    bank('2026-08-21', -100),
    bank('2026-08-25', -200),
    bank('2026-08-30', -200),
    bank('2026-09-01', -500),               // one-off: says nothing about next week
    bank('2026-09-05', -340),
    bank('2026-09-06', -1000, 'transfer'),  // to savings
    bank('2026-09-08', 2000),               // pay
    bank('2026-09-10', -900, 'matched'),    // a planned bill
    txn('2026-09-09', -80),                 // still a plan
  ]

  it('averages the last full statement weeks, leaving out one-offs', () => {
    expect(everydaySpending(rows)).toEqual({ perDay: 40, perWeek: 280, weeks: 3 })
  })

  it('looks back only a few weeks, so a quieter stretch shows quickly', () => {
    const older = [bank('2026-08-14', -399), bank('2026-08-15', -399), bank('2026-08-16', -399)]
    expect(everydaySpending([...older, ...rows])?.perWeek).toBe(280)
  })

  it('needs two full statement weeks', () => {
    expect(everydaySpending(rows.filter((t) => t.date >= '2026-09-01'))).toBe(null)
    expect(everydaySpending([txn('2026-09-09', -80)])).toBe(null)
  })
})

describe('paydays', () => {
  it('counts a Thursday and a Friday paycheque as one payday, and ignores other income', () => {
    const rows = [
      bank('2026-08-27', 3000, 'bank', 'DÉPÔT DE PAIE PAIE/PAYROLL'),
      bank('2026-08-28', 2400, 'bank', 'DÉPÔT DE PAIE'),
      txn('2026-09-10', 3000, { label: 'Paye' }),
      txn('2026-09-11', 2400, { label: 'Paye' }),
      txn('2026-09-18', 650, { label: 'Allocation' }),
      txn('2026-09-24', 3000, { label: 'Paycheque' }),
    ]
    expect(paydays(rows)).toEqual(['2026-08-27', '2026-09-10', '2026-09-24'])
  })
})

describe('savingsPlan with a goal per pay', () => {
  // paid today (Thursday) and in two weeks; everyday spending of $30/day; 200 already moved this pay
  const rows = [
    bank('2026-08-21', -210), bank('2026-08-28', -210), bank('2026-09-04', -210),
    bank('2026-09-03', -500, 'transfer'),                       // last pay's savings
    bank('2026-09-10', 2000, 'bank', 'DÉPÔT DE PAIE'),
    bank('2026-09-10', -200, 'transfer'),                       // this pay's savings
    txn('2026-09-15', -900),
    txn('2026-09-24', -300),                                    // payday bill: goes out before the pay lands
    txn('2026-09-24', 2000, { label: 'Paye' }),
    txn('2026-09-25', 1500, { label: 'Paye' }),
  ]
  const goal = { payGoal: 1500, buffer: 500 }

  it('runs to the next payday, without the paycheque that closes it', () => {
    const plan = savingsPlan(rows, daysUpTo('2026-09-10', 4000), TODAY, goal)
    expect(plan.lastPay).toBe('2026-09-10')
    expect(plan.nextPay).toBe('2026-09-24')
    expect(plan.horizonDays).toBe(14)
    expect(plan.upcomingIn).toBe(0)
    expect(plan.upcomingOut).toBe(-1200)
  })

  it('asks for what is left of the goal and tells what that leaves to spend', () => {
    const plan = savingsPlan(rows, daysUpTo('2026-09-10', 4000), TODAY, goal)
    expect(plan.moved).toBe(200)
    expect(plan.setAside).toBe(1300)
    expect(plan.goalGap).toBe(0)
    // 2700 after the move, 1200 of bills: 71/day keeps 500 on payday
    expect(plan.allowance).toEqual({ perDay: 71, floor: 'cushion' })
    // at the usual $30/day: 2700 − 14 × 30 − 1200
    expect(plan.low).toBe(1080)
    expect(plan.lowDate).toBe('2026-09-24')
  })

  it('counts what "I moved it" recorded, and a transfer back against it', () => {
    const moved = [...rows, txn('2026-09-10', -1300, { label: 'Épargne' })]
    expect(savingsPlan(moved, daysUpTo('2026-09-10', 2700), TODAY, goal)).toMatchObject({ moved: 1500, setAside: 0, goalGap: 0 })
    const back = [...rows, bank('2026-09-10', 100, 'transfer')]
    expect(savingsPlan(back, daysUpTo('2026-09-10', 4100), TODAY, goal).setAside).toBe(1400)
  })

  it('dips into the cushion for the goal, and says how to stay above zero', () => {
    const plan = savingsPlan(rows, daysUpTo('2026-09-10', 2900), TODAY, goal)
    expect(plan.setAside).toBe(1300)
    expect(plan.allowance).toEqual({ perDay: 28, floor: 'zero' })
  })

  it('keeps only what the bills before payday leave room for', () => {
    const plan = savingsPlan(rows, daysUpTo('2026-09-10', 1500), TODAY, goal)
    expect(plan.setAside).toBe(300)
    expect(plan.goalGap).toBe(1000)
    expect(plan.allowance).toEqual({ perDay: 0, floor: 'zero' })
    expect(plan.low).toBe(-420)
  })
})

describe('savingsPlan with everyday spending', () => {
  // statement through Sep 7, three days before TODAY; $10 a day of everyday spending
  const rows = [bank('2026-08-25', -70), bank('2026-09-07', -70), txn('2026-09-12', -500), txn('2026-09-14', 1000)]
  const plan = savingsPlan(rows, daysUpTo('2026-09-10', 1000), TODAY, { horizonDays: 7, buffer: 0 })

  it('takes out what was likely spent since the statement', () => {
    expect(plan.everyday?.perDay).toBe(10)
    expect(plan.statementDate).toBe('2026-09-07')
    expect(plan.statementAge).toBe(3)
    expect(plan.spentSince).toBe(30)
  })

  it('reserves everyday spending every day, before the day\'s income', () => {
    expect(plan.everydayAhead).toBe(70)
    // 1000 − 30 − 2 days − 500 − 2 days = 430 on the 14th, before the 1000 lands
    expect(plan.setAside).toBe(430)
    expect(plan.low).toBe(0)
    expect(plan.lowDate).toBe('2026-09-14')
    expect(plan.projected).toBe(970)
    // and what is left to spend is exactly that pace
    expect(plan.allowance).toEqual({ perDay: 10, floor: 'cushion' })
  })
})

describe('savings targets', () => {
  // paid every second Thursday; the eves of the last three paydays end at 1000, 1200 and 900
  const rows = [
    bank('2026-08-13', 2000, 'bank', 'DÉPÔT DE PAIE'),
    bank('2026-08-14', -500, 'transfer'),
    bank('2026-08-27', 2000, 'bank', 'DÉPÔT DE PAIE'),
    bank('2026-09-01', -700, 'transfer'),
    bank('2026-09-02', 100, 'transfer'),    // back from savings
    bank('2026-09-10', 2000, 'bank', 'DÉPÔT DE PAIE'),
    bank('2026-09-10', -300, 'transfer'),   // this pay
    txn('2026-09-24', 2000, { label: 'Paye' }),
  ]
  const days: MoneyDay[] = [
    { date: '2026-08-12', income: 0, expense: 0, net: 0, balance: 1000 },
    { date: '2026-08-26', income: 0, expense: 0, net: 0, balance: 1200 },
    { date: '2026-09-09', income: 0, expense: 0, net: 0, balance: 900 },
    { date: '2026-09-10', income: 0, expense: 0, net: 0, balance: 2600 },
  ]
  const fund = { name: 'Fund', amount: 10000, date: '2026-12-31', balance: 2000, balanceDate: '2026-09-01' }
  const other = { name: 'Other', amount: 5000, date: '2026-10-31', balance: 4000, balanceDate: '2026-09-01' }

  it('measures what each complete pay period freed, moves to savings included', () => {
    // (1200 − 1000 + 500) and (900 − 1200 + 600), averaged
    expect(freedPerPay(rows, days, TODAY)).toBe(500)
    expect(freedPerPay(rows, days.slice(2), TODAY)).toBe(null)
  })

  it('adds the moves since the balance was entered, and projects the recent pace to the date', () => {
    const [progress] = targetsProgress([fund], rows, days, TODAY, '2026-08-01')
    expect(progress.movedSince).toBe(200)      // 300 out this pay, 100 back on the 2nd
    expect(progress.saved).toBe(2200)
    expect(progress.paysLeft).toBe(8)          // Sep 24 … Dec 31
    expect(progress.perPay).toBe(866.67)       // 7800 over 9 pays, this one included
    expect(progress.pace).toBe(500)
    // 2200, the 200 this pay hasn't moved yet, then 8 × 500
    expect(progress.projected).toBe(6400)
    expect(progress.stale).toBe(false)
  })

  it('gives moves and the pace to the first target only', () => {
    const [, second] = targetsProgress([fund, other], rows, days, TODAY, '2026-08-01')
    expect(second).toMatchObject({ saved: 4000, movedSince: 0, paysLeft: 3, perPay: 250, pace: null, projected: null })
  })

  it('asks for the balance again once it predates the loaded ledger', () => {
    const [progress] = targetsProgress([{ ...fund, balanceDate: '2026-07-01' }], rows, days, TODAY, '2026-08-01')
    expect(progress.stale).toBe(true)
  })

  it('starts from zero until a balance is entered', () => {
    const [progress] = targetsProgress([{ name: 'New', amount: 1000, date: '2026-10-08' }], rows, days, TODAY, '2026-08-01')
    expect(progress).toMatchObject({ saved: 0, movedSince: 0, paysLeft: 2, perPay: 333.33 })
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
