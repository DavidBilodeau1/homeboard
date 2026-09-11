import { describe, expect, it } from 'vitest'
import { balanceOn, mergeDays } from './expensave.js'
import { expensaveMockApi } from './expensaveMock.js'

describe('mergeDays', () => {
  it('adds up the household total per day across calendars', () => {
    const merged = mergeDays([
      [{ date: '2026-09-10', income: 2000, expense: -120, net: 1880, balance: 3000 }],
      [{ date: '2026-09-10', income: 0, expense: -30.5, net: -30.5, balance: 400 }],
      [{ date: '2026-09-09', income: 0, expense: -10, net: -10, balance: 1120 }],
    ])
    expect(merged.map((d) => d.date)).toEqual(['2026-09-09', '2026-09-10'])
    expect(merged[1]).toEqual({ date: '2026-09-10', income: 2000, expense: -150.5, net: 1849.5, balance: 3400 })
  })

  it('ignores days with no date rather than bucketing them together', () => {
    expect(mergeDays([[{ date: null, income: 5, expense: 0, net: 5, balance: 5 }]])).toEqual([])
  })
})

describe('balanceOn', () => {
  const days = [
    { date: '2026-09-08', balance: 100 },
    { date: '2026-09-10', balance: 250 },
    { date: '2026-09-12', balance: 900 },
  ]
  it('takes the latest day at or before the given one', () => {
    expect(balanceOn(days, '2026-09-11')).toBe(250)
    expect(balanceOn(days, '2026-09-10')).toBe(250)
  })
  it('is null before the series starts', () => {
    expect(balanceOn(days, '2026-09-01')).toBe(null)
    expect(balanceOn([], '2026-09-01')).toBe(null)
  })
})

describe('demo ledger', () => {
  const api = expensaveMockApi(() => new Date(2026, 8, 10))

  it('serves the same shape as Expensave itself', async () => {
    const { expenses, expenseBalances } = await api.expenses(1, '2026-09-01', '2026-09-30')
    expect(expenses.length).toBeGreaterThan(0)
    expect(expenseBalances).toHaveLength(30)
    expect(Object.keys(expenseBalances[0]).sort())
      .toEqual(['balance', 'balanceAt', 'change', 'expense', 'income'])
    expect(expenseBalances[0].balanceAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('marks everything after today as still planned', async () => {
    const { expenses } = await api.expenses(1, '2026-09-01', '2026-09-30')
    expect(expenses.filter((e) => e.createdAt < '2026-09-10').every((e) => e.confirmed)).toBe(true)
    expect(expenses.filter((e) => e.createdAt > '2026-09-11').every((e) => !e.confirmed)).toBe(true)
  })

  it('keeps the balance moving only on confirmed days', async () => {
    const { expenseBalances } = await api.expenses(1, '2026-09-10', '2026-09-30')
    const future = expenseBalances.filter((b) => b.balanceAt > '2026-09-11')
    expect(future.every((b) => b.change === 0)).toBe(true)
    expect(new Set(future.map((b) => b.balance)).size).toBe(1)
  })
})
