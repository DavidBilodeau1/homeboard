import React, { useMemo } from 'react'
import { useStore } from '../store'
import { calendarColor, calendarName, fmtMoney, fmtWeekRange } from '../expensave'
import { dayKey } from '../util'
import type { MoneyWeek, Transaction } from '../types'
import { MoneyIcon } from '../icons'

/**
 * The Money page answers one question: how much can we move to savings?
 *
 * The hero number is the set-aside amount — what survives every bill already
 * scheduled in the look-ahead window, minus the buffer that stays in the
 * account. Under it, week by week, is the trend that says whether that number
 * is a fluke or a habit.
 */

const dateLabel = (day: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' })
    .format(new Date(`${day}T00:00:00`))

function TxnRow({ txn, locale, currency }: { txn: Transaction; locale: string; currency: string }) {
  return (
    <div className="mny-txn">
      <i className="mny-dot" style={{ background: txn.category?.color ?? 'var(--faint)' }} />
      <span className="mny-txn-day">{dateLabel(txn.date, locale)}</span>
      <span className="mny-txn-label">
        {txn.label}
        {txn.recurring && <em className="mny-tag">↻</em>}
      </span>
      <span className={`mny-amt ${txn.amount >= 0 ? 'in' : 'out'}`}>{fmtMoney(txn.amount, locale, currency)}</span>
    </div>
  )
}

function WeekRow({ week, scale, locale, currency, t }: {
  week: MoneyWeek
  scale: number
  locale: string
  currency: string
  t: (k: string, v?: Record<string, string | number>) => string
}) {
  // an empty week draws no bar at all rather than a misleading stub
  const pct = (v: number) => (v === 0 ? '0' : `${Math.max(2, Math.min(100, (Math.abs(v) / scale) * 100))}%`)
  return (
    <div className={`mny-week${week.current ? ' current' : ''}${week.future ? ' future' : ''}`}>
      <span className="mny-week-range">
        {fmtWeekRange(week, locale)}
        {week.current && <em>{t('money.thisWeek')}</em>}
      </span>
      <span className="mny-week-bars">
        <span className="mny-bar in" style={{ width: pct(week.income) }} />
        <span className="mny-bar out" style={{ width: pct(week.expense) }} />
      </span>
      <span className="mny-week-io">
        <b className={week.income ? 'in' : 'zero'}>{fmtMoney(week.income, locale, currency, false)}</b>
        <b className={week.expense ? 'out' : 'zero'}>{fmtMoney(week.expense, locale, currency, false)}</b>
      </span>
      <span className={`mny-amt ${week.net > 0 ? 'in' : week.net < 0 ? 'out' : 'zero'}`}>
        {week.net > 0 ? '+' : ''}{fmtMoney(week.net, locale, currency, false)}
      </span>
    </div>
  )
}

export function MoneyPage() {
  const { money, moneyError, config, locale, t } = useStore()
  const cfg = config?.expensave

  const typical = useMemo(() => {
    if (!money) return null
    // the last four finished weeks that actually have entries — a week with no
    // transactions is missing data, not a week that netted zero. Fewer than four
    // and pay cycles skew it badly, so say nothing rather than something wrong.
    const done = money.weeks.filter((w) => !w.current && !w.future && w.count > 0).slice(-4)
    if (done.length < 4) return null
    return Math.round((done.reduce((s, w) => s + w.net, 0) / done.length) * 100) / 100
  }, [money])

  if (moneyError) {
    return (
      <div className="card page-card mny-page">
        <h2 className="card-title">{t('nav.money')}</h2>
        <p className="settings-note">{t('money.unavailable')}</p>
        <p className="settings-note mny-err">{moneyError}</p>
      </div>
    )
  }

  if (!money) {
    return (
      <div className="card page-card mny-page">
        <h2 className="card-title">{t('nav.money')}</h2>
        <p className="settings-note">{t('money.loading')}</p>
      </div>
    )
  }

  const { plan, weeks, currency, calendars } = money
  const current = weeks.find((w) => w.current)
  const goal = cfg?.weeklyGoal
  const scale = Math.max(1, ...weeks.map((w) => Math.max(w.income, Math.abs(w.expense))))
  const todayKey = dayKey(new Date())
  const lateUncleared = money.transactions.filter((tx) => !tx.confirmed && tx.date <= todayKey)

  return (
    <div className="mny-page">
      <section className="card mny-hero">
        <h2 className="card-title"><MoneyIcon size={20} /> {t('money.setAside')}</h2>
        <div className={`mny-hero-value${plan.shortfall ? ' short' : ''}`}>
          {fmtMoney(plan.shortfall ? -plan.shortfall : plan.setAside, locale, currency)}
        </div>
        <p className="mny-hero-sub">
          {plan.shortfall
            ? t('money.shortfallHint', { days: plan.horizonDays })
            : t('money.setAsideHint', { days: plan.horizonDays })}
        </p>

        <div className="mny-breakdown">
          <div><span>{t('money.balanceNow')}</span><b>{fmtMoney(plan.balance, locale, currency)}</b></div>
          {plan.uncleared !== 0 && (
            <div>
              <span>{t('money.uncleared', { count: plan.unclearedCount })}</span>
              <b className="out">{fmtMoney(plan.uncleared, locale, currency)}</b>
            </div>
          )}
          {plan.upcomingIn !== 0 && (
            <div><span>{t('money.incomingSoon')}</span><b className="in">+{fmtMoney(plan.upcomingIn, locale, currency)}</b></div>
          )}
          {plan.upcomingOut !== 0 && (
            <div><span>{t('money.billsSoon')}</span><b className="out">{fmtMoney(plan.upcomingOut, locale, currency)}</b></div>
          )}
          {/* the trough, not the end balance, is what limits today's transfer */}
          {plan.lowDate !== dayKey(new Date()) && (
            <div className="mny-low">
              <span>{t('money.lowestPoint', { date: dateLabel(plan.lowDate, locale) })}</span>
              <b>{fmtMoney(plan.low, locale, currency)}</b>
            </div>
          )}
          {plan.buffer !== 0 && (
            <div><span>{t('money.buffer')}</span><b className="out">−{fmtMoney(plan.buffer, locale, currency)}</b></div>
          )}
          <div className="mny-total">
            <span>{t('money.projected', { date: dateLabel(plan.horizonEnd, locale) })}</span>
            <b>{fmtMoney(plan.projected, locale, currency)}</b>
          </div>
        </div>

        {goal != null && goal > 0 && (
          <div className="mny-goal">
            <div className="mny-goal-head">
              <span>{t('money.goal')}</span>
              <b>{fmtMoney(Math.min(plan.setAside, goal), locale, currency, false)} / {fmtMoney(goal, locale, currency, false)}</b>
            </div>
            <div className="mny-goal-bar">
              <span style={{ width: `${Math.min(100, (plan.setAside / goal) * 100)}%` }} />
            </div>
          </div>
        )}

        {typical != null && (
          <p className="mny-typical">
            {t('money.typicalWeek')} <b className={typical >= 0 ? 'in' : 'out'}>
              {typical > 0 ? '+' : ''}{fmtMoney(typical, locale, currency, false)}
            </b>
          </p>
        )}
      </section>

      <section className="card mny-weeks">
        <h2 className="card-title">{t('money.weekByWeek')}</h2>
        {current && (
          <p className="mny-current">
            {t('money.currentSummary', {
              in: fmtMoney(current.income, locale, currency, false),
              out: fmtMoney(Math.abs(current.expense), locale, currency, false),
            })}
          </p>
        )}
        <div className="mny-week-list">
          {weeks.map((w) => (
            <WeekRow key={w.start} week={w} scale={scale} locale={locale} currency={currency} t={t} />
          ))}
        </div>
      </section>

      <section className="card mny-upcoming">
        <h2 className="card-title">{t('money.upcoming', { days: plan.horizonDays })}</h2>
        <div className="mny-txn-list">
          {lateUncleared.map((tx) => <TxnRow key={`u${tx.id}`} txn={tx} locale={locale} currency={currency} />)}
          {plan.commitments.map((tx) => <TxnRow key={tx.id} txn={tx} locale={locale} currency={currency} />)}
          {!plan.commitments.length && !lateUncleared.length && (
            <div className="cal-empty">{t('money.nothingScheduled')}</div>
          )}
        </div>
      </section>

      <section className="card mny-accounts">
        <h2 className="card-title">{t('money.accounts')}</h2>
        <div className="mny-acc-list">
          {calendars.map((c, i) => (
            <div className="mny-acc" key={c.id}>
              <i className="mny-dot" style={{ background: calendarColor(cfg, c.id, i) }} />
              <span>{calendarName(cfg, c)}</span>
              <b>{fmtMoney(c.balanceToday ?? c.balance, locale, currency)}</b>
            </div>
          ))}
          {!calendars.length && <div className="cal-empty">{t('money.noCalendars')}</div>}
        </div>
        {!money.transactions.length && <p className="settings-note">{t('money.noTransactions')}</p>}
        {money.errors.map((e) => <p className="settings-note mny-err" key={e}>{e}</p>)}
      </section>
    </div>
  )
}
