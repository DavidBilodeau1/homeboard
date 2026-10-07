import React, { useMemo } from 'react'
import { LayerChip } from '../../components/LayerChip'
import { useStore } from '../../store'
import { usePluginSettings } from '../settings'
import { calendarColor, calendarName, fmtChip, fmtMoney, groupByDay, layerId } from './money'
import { useMoney } from './MoneyProvider'
import type { ExpensaveSettings } from './types'

const useShownByDefault = () => usePluginSettings<ExpensaveSettings>('expensave').showInCalendar ?? true

/** Transactions of the Expensave calendars switched on for this screen, by day. */
function useVisibleMoney() {
  const { layerVisible } = useStore()
  const { money } = useMoney()
  const shownByDefault = useShownByDefault()
  return useMemo(() => {
    if (!money) return null
    const shown = money.transactions.filter((tx) => layerVisible(layerId(tx.calendar), shownByDefault))
    return { byDay: groupByDay(shown), currency: money.currency }
  }, [money, layerVisible, shownByDefault])
}

export function MoneyLegend() {
  const { money } = useMoney()
  const settings = usePluginSettings<ExpensaveSettings>('expensave')
  const shownByDefault = useShownByDefault()
  return (
    <>
      {money?.calendars.map((calendar, i) => (
        <LayerChip key={calendar.id} id={layerId(calendar.id)} color={calendarColor(settings, calendar.id, i)}
          label={calendarName(settings, calendar)} fallback={shownByDefault} />
      ))}
    </>
  )
}

/** The day's net, in the same spot in every cell so a column scans. */
export function MoneyDayBadge({ day }: { day: string }) {
  const { locale } = useStore()
  const visible = useVisibleMoney()
  const total = visible?.byDay.get(day)
  if (!visible || !total) return null
  return <span className={`calpage-money ${total.net >= 0 ? 'in' : 'out'}`}>{fmtChip(total.net, locale, visible.currency)}</span>
}

export function MoneyDayDetails({ day }: { day: string }) {
  const { locale, t } = useStore()
  const visible = useVisibleMoney()
  const total = visible?.byDay.get(day)
  if (!visible || !total) return null
  return (
    <div className="calpage-day-money">
      <div className="calpage-day-money-head">
        <span>{t('money.dayTotal')}</span>
        <b className={total.net >= 0 ? 'in' : 'out'}>{fmtChip(total.net, locale, visible.currency)}</b>
      </div>
      {total.transactions.map((tx) => (
        <div className={`cal-event mny-line${tx.confirmed ? '' : ' planned'}`} key={tx.id}>
          <div className="cal-event-title">
            <i className="ev-dot" style={{ background: tx.category?.color ?? 'var(--faint)' }} />
            {tx.label}
            {!tx.confirmed && <em className="mny-tag">{t('money.planned')}</em>}
          </div>
          <div className={`cal-event-time mny-amt ${tx.amount >= 0 ? 'in' : 'out'}`}>{fmtMoney(tx.amount, locale, visible.currency)}</div>
        </div>
      ))}
    </div>
  )
}
