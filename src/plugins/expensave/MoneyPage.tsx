import React, { useMemo, useState } from 'react'
import { MoneyIcon } from '../../icons'
import type { Translate } from '../../i18n'
import { useStore } from '../../store'
import { dayKey } from '../../util'
import { usePluginSettings } from '../settings'
import { recordSetAside } from './api'
import { BankImport } from './BankImport'
import { calendarColor, calendarName, DEFAULT_IMPORT_EVERY_DAYS, fmtMoney, fmtWeekRange, parseAmount } from './money'
import { useMoney } from './MoneyProvider'
import type { ExpensaveSettings, MoneyState, MoneyWeek, SavingsPlan, Transaction } from './types'

const TYPICAL_WEEKS = 4

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
  t: Translate
}) {
  // an empty week draws no bar rather than a misleading stub
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

/** Average net of the last finished weeks with entries; null when too few to mean anything. */
function typicalWeek(weeks: MoneyWeek[]): number | null {
  // a week without entries is missing data, not a week that netted zero
  const done = weeks.filter((w) => !w.current && !w.future && w.count > 0).slice(-TYPICAL_WEEKS)
  if (done.length < TYPICAL_WEEKS) return null
  return Math.round((done.reduce((sum, w) => sum + w.net, 0) / done.length) * 100) / 100
}

function Breakdown({ plan, currency }: { plan: SavingsPlan; currency: string }) {
  const { locale, t } = useStore()
  const money = (v: number) => fmtMoney(v, locale, currency)
  return (
    <div className="mny-breakdown">
      <div><span>{t('money.balanceNow')}</span><b>{money(plan.balance)}</b></div>
      {plan.spentSince !== 0 && plan.statementDate && (
        <div>
          <span>{t('money.spentSince', { date: dateLabel(plan.statementDate, locale) })}</span>
          <b className="out">−{money(plan.spentSince)}</b>
        </div>
      )}
      {plan.uncleared !== 0 && (
        <div><span>{t('money.uncleared', { count: plan.unclearedCount })}</span><b className="out">{money(plan.uncleared)}</b></div>
      )}
      {plan.upcomingIn !== 0 && <div><span>{t('money.incomingSoon')}</span><b className="in">+{money(plan.upcomingIn)}</b></div>}
      {plan.upcomingOut !== 0 && <div><span>{t('money.billsSoon')}</span><b className="out">{money(plan.upcomingOut)}</b></div>}
      {plan.everyday && plan.everydayAhead !== 0 && (
        <div>
          <span>{t('money.everyday', { perDay: fmtMoney(plan.everyday.perDay, locale, currency, false) })}</span>
          <b className="out">−{money(plan.everydayAhead)}</b>
        </div>
      )}
      {plan.lowDate !== dayKey(new Date()) && (
        <div className="mny-low">
          <span>{t('money.lowestPoint', { date: dateLabel(plan.lowDate, locale) })}</span>
          <b>{money(plan.low)}</b>
        </div>
      )}
      {plan.buffer !== 0 && <div><span>{t('money.buffer')}</span><b className="out">−{money(plan.buffer)}</b></div>}
      <div className="mny-total">
        <span>{t('money.projected', { date: dateLabel(plan.horizonEnd, locale) })}</span>
        <b>{money(plan.projected)}</b>
      </div>
    </div>
  )
}

function WeeklyGoal({ goal, setAside, currency }: { goal: number; setAside: number; currency: string }) {
  const { locale, t } = useStore()
  return (
    <div className="mny-goal">
      <div className="mny-goal-head">
        <span>{t('money.goal')}</span>
        <b>{fmtMoney(Math.min(setAside, goal), locale, currency, false)} / {fmtMoney(goal, locale, currency, false)}</b>
      </div>
      <div className="mny-goal-bar">
        <span style={{ width: `${Math.min(100, (setAside / goal) * 100)}%` }} />
      </div>
    </div>
  )
}

/** How old the bank data behind the number is; past the import rhythm it shouldn't be trusted. */
function StatementAge({ plan, late }: { plan: SavingsPlan; late: boolean }) {
  const { locale, t } = useStore()
  if (!plan.statementDate || plan.statementAge == null) return <p className="mny-asof late">{t('money.noStatement')}</p>
  const date = dateLabel(plan.statementDate, locale)
  const text = late
    ? t('money.statementLate', { date, count: plan.statementAge })
    : plan.statementAge === 0 ? t('money.statementToday', { date }) : t('money.statementAge', { date, count: plan.statementAge })
  return (
    <p className={`mny-asof${late ? ' late' : ''}`}>
      {text}
      {!plan.everyday && <> {t('money.everydayUnknown')}</>}
    </p>
  )
}

/** Records a transfer to savings right away, so the amount drops before the next statement shows it. */
function MovedIt({ suggested, calendar }: { suggested: number; calendar: number }) {
  const { t } = useStore()
  const { reload } = useMoney()
  const [text, setText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const amount = text == null ? null : parseAmount(text)

  if (text == null) {
    return <button className="dash-cancel mny-moved" onClick={() => setText(String(Math.floor(suggested)))}>{t('money.movedIt')}</button>
  }

  const save = async () => {
    if (!amount || amount <= 0) return
    setBusy(true)
    setError(null)
    try {
      await recordSetAside({ calendar, amount, label: t('money.savedLabel'), date: dayKey(new Date()) })
      setText(null)
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mny-moved-form">
      <label className="bank-field">
        <span>{t('money.movedAmount')}</span>
        <input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} autoFocus />
      </label>
      <div className="mny-moved-actions">
        <button className="dash-cancel" onClick={() => setText(null)} disabled={busy}>{t('bank.cancel')}</button>
        <button className="dash-save" onClick={save} disabled={busy || !amount || amount <= 0}>{t('money.record')}</button>
      </div>
      <p className="settings-note">{t('money.movedHint')}</p>
      {error && <p className="settings-note mny-err">{error}</p>}
    </div>
  )
}

function SetAsideCard({ money, settings }: { money: MoneyState; settings: ExpensaveSettings }) {
  const { locale, t } = useStore()
  const { plan, currency } = money
  const typical = useMemo(() => typicalWeek(money.weeks), [money.weeks])
  const late = plan.statementAge != null && plan.statementAge > (settings.importEveryDays ?? DEFAULT_IMPORT_EVERY_DAYS)
  const calendar = settings.calendars?.[0]?.id ?? money.calendars[0]?.id
  const weeklyGoal = settings.weeklyGoal
  return (
    <section className="card mny-hero">
      <h2 className="card-title"><MoneyIcon size={20} /> {t('money.setAside')}</h2>
      <div className={`mny-hero-value${plan.shortfall ? ' short' : ''}${late ? ' stale' : ''}`}>
        {fmtMoney(plan.shortfall ? -plan.shortfall : plan.setAside, locale, currency)}
      </div>
      <p className="mny-hero-sub">
        {t(plan.shortfall ? 'money.shortfallHint' : 'money.setAsideHint', { days: plan.horizonDays })}
      </p>
      <StatementAge plan={plan} late={late} />
      <Breakdown plan={plan} currency={currency} />
      {money.canWrite && calendar != null && plan.setAside > 0 && <MovedIt suggested={plan.setAside} calendar={calendar} />}
      {!!weeklyGoal && weeklyGoal > 0 && <WeeklyGoal goal={weeklyGoal} setAside={plan.setAside} currency={currency} />}
      {typical != null && (
        <p className="mny-typical">
          {t('money.typicalWeek')} <b className={typical >= 0 ? 'in' : 'out'}>
            {typical > 0 ? '+' : ''}{fmtMoney(typical, locale, currency, false)}
          </b>
        </p>
      )}
    </section>
  )
}

function WeeksCard({ weeks, currency }: { weeks: MoneyWeek[]; currency: string }) {
  const { locale, t } = useStore()
  const current = weeks.find((w) => w.current)
  const scale = Math.max(1, ...weeks.map((w) => Math.max(w.income, Math.abs(w.expense))))
  return (
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
        {weeks.map((w) => <WeekRow key={w.start} week={w} scale={scale} locale={locale} currency={currency} t={t} />)}
      </div>
    </section>
  )
}

function UpcomingCard({ money }: { money: MoneyState }) {
  const { locale, t } = useStore()
  const { plan, currency } = money
  const todayKey = dayKey(new Date())
  const lateUncleared = money.transactions.filter((tx) => !tx.confirmed && tx.date <= todayKey)
  return (
    <section className="card mny-upcoming">
      <h2 className="card-title">{t('money.upcoming', { days: plan.horizonDays })}</h2>
      <div className="mny-txn-list">
        {lateUncleared.map((tx) => <TxnRow key={`u${tx.id}`} txn={tx} locale={locale} currency={currency} />)}
        {plan.commitments.map((tx) => <TxnRow key={tx.id} txn={tx} locale={locale} currency={currency} />)}
        {!plan.commitments.length && !lateUncleared.length && <div className="cal-empty">{t('money.nothingScheduled')}</div>}
      </div>
    </section>
  )
}

function AccountsCard({ money, settings }: { money: MoneyState; settings: ExpensaveSettings }) {
  const { locale, t } = useStore()
  return (
    <section className="card mny-accounts">
      <h2 className="card-title">{t('money.accounts')}</h2>
      <div className="mny-acc-list">
        {money.calendars.map((calendar, i) => (
          <div className="mny-acc" key={calendar.id}>
            <i className="mny-dot" style={{ background: calendarColor(settings, calendar.id, i) }} />
            <span>{calendarName(settings, calendar)}</span>
            <b>{fmtMoney(calendar.balanceToday ?? calendar.balance, locale, money.currency)}</b>
          </div>
        ))}
        {!money.calendars.length && <div className="cal-empty">{t('money.noCalendars')}</div>}
      </div>
      {!money.transactions.length && <p className="settings-note">{t('money.noTransactions')}</p>}
      {money.errors.map((e) => <p className="settings-note mny-err" key={e}>{e}</p>)}
    </section>
  )
}

/** How much can move to savings, the weekly trend behind it, and the bank statement sync. */
export function MoneyPage() {
  const { t } = useStore()
  const { money, error } = useMoney()
  const settings = usePluginSettings<ExpensaveSettings>('expensave')

  if (error || !money) {
    return (
      <div className="card page-card mny-page">
        <h2 className="card-title">{t('nav.money')}</h2>
        <p className="settings-note">{error ? t('money.unavailable') : t('money.loading')}</p>
        {error && <p className="settings-note mny-err">{error}</p>}
      </div>
    )
  }

  return (
    <div className="mny-page">
      <SetAsideCard money={money} settings={settings} />
      <WeeksCard weeks={money.weeks} currency={money.currency} />
      <BankImport />
      <UpcomingCard money={money} />
      <AccountsCard money={money} settings={settings} />
    </div>
  )
}
