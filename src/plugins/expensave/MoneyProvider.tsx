import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../../store'
import { usePluginSettings } from '../settings'
import { getExpensaveRange } from './api'
import { currencyOf, groupByDay, moneyRange, savingsPlan, weeklyMoney } from './money'
import type { ExpensaveSettings, MoneyState } from './types'

const REFRESH_MS = 5 * 60_000

interface MoneyContext {
  money: MoneyState | null
  error: string | null
  /** fetches the ledger again, e.g. after a bank import rewrote it */
  reload: () => void
}

const Ctx = createContext<MoneyContext>({ money: null, error: null, reload: () => {} })

export const useMoney = () => useContext(Ctx)

/** One ledger fetch feeds the Money page, its tile and the calendar layer; it follows the displayed month. */
export function MoneyProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const { monthCursor } = useStore()
  const settings = usePluginSettings<ExpensaveSettings>('expensave')
  const [money, setMoney] = useState<MoneyState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!active) return
    const today = new Date()
    const { start, end } = moneyRange(monthCursor, today, settings.horizonDays)
    try {
      const payload = await getExpensaveRange((settings.calendars ?? []).map((c) => c.id), start, end)
      setMoney({
        calendars: payload.calendars,
        transactions: payload.transactions,
        days: payload.days,
        weeks: weeklyMoney(payload.transactions, today),
        plan: savingsPlan(payload.transactions, payload.days, today, settings),
        byDay: groupByDay(payload.transactions),
        currency: currencyOf(settings),
        errors: payload.errors,
      })
      setError(null)
    } catch (e) {
      setMoney(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [active, monthCursor, settings])

  useEffect(() => {
    reload()
    const timer = setInterval(reload, REFRESH_MS)
    return () => clearInterval(timer)
  }, [reload])

  const value = useMemo(() => ({ money: active ? money : null, error, reload }), [active, money, error, reload])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
