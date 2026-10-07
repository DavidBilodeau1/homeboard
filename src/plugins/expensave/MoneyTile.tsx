import React from 'react'
import { MoneyIcon } from '../../icons'
import { navigate } from '../../navigation'
import { useStore } from '../../store'
import type { TileProps } from '../types'
import { fmtMoney } from './money'
import { useMoney } from './MoneyProvider'

/** The set-aside number and how this week is going. */
export function MoneyTile({ editing }: TileProps) {
  const { locale, t } = useStore()
  const { money, error } = useMoney()
  const onOpen = editing ? undefined : () => navigate('money')

  if (error || !money) {
    return (
      <section className="card mny-card">
        <h2 className="card-title"><MoneyIcon size={18} /> {t('nav.money')}</h2>
        <div className="cal-empty">{error ? t('money.unavailable') : t('money.loading')}</div>
      </section>
    )
  }

  const { plan, currency } = money
  const week = money.weeks.find((w) => w.current)

  return (
    <section className="card mny-card" onClick={onOpen} role={onOpen ? 'button' : undefined}>
      <h2 className="card-title"><MoneyIcon size={18} /> {t('nav.money')}</h2>
      <div className="mny-card-body">
        <span className="mny-card-label">{t('money.setAside')}</span>
        <span className={`mny-card-value${plan.shortfall ? ' short' : ''}`}>
          {fmtMoney(plan.shortfall ? -plan.shortfall : plan.setAside, locale, currency, false)}
        </span>
        <span className="mny-card-sub">{t('money.throughDays', { days: plan.horizonDays })}</span>
      </div>
      {week && (
        <div className="mny-card-week">
          <span><i className="in" />{fmtMoney(week.income, locale, currency, false)}</span>
          <span><i className="out" />{fmtMoney(Math.abs(week.expense), locale, currency, false)}</span>
        </div>
      )}
    </section>
  )
}
