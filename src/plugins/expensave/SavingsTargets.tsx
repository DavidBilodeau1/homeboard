import React, { useState } from 'react'
import { useStore } from '../../store'
import { dayKey } from '../../util'
import { fmtMoney, parseAmount } from './money'
import type { ExpensaveSettings, MoneyState, TargetProgress } from './types'

const longDate = (day: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${day}T00:00:00`))

/** Asks what the savings account holds today; moves from tomorrow on then add up by themselves. */
function BalanceForm({ initial, hint, onSave, onCancel }: {
  initial: number | undefined
  hint: string
  onSave: (balance: number) => Promise<void>
  onCancel: () => void
}) {
  const { t } = useStore()
  const [text, setText] = useState(initial == null ? '' : String(initial))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const amount = parseAmount(text)

  const save = async () => {
    if (amount == null || amount < 0) return
    setBusy(true)
    setError(null)
    try {
      await onSave(amount)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="mny-moved-form">
      <label className="bank-field">
        <span>{t('money.target.balanceToday')}</span>
        <input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} autoFocus />
      </label>
      <div className="mny-moved-actions">
        <button className="dash-cancel" onClick={onCancel} disabled={busy}>{t('bank.cancel')}</button>
        <button className="dash-save" onClick={save} disabled={busy || amount == null || amount < 0}>{t('money.record')}</button>
      </div>
      <p className="settings-note">{hint}</p>
      {error && <p className="settings-note mny-err">{error}</p>}
    </div>
  )
}

function TargetCard({ progress, index, money, settings }: {
  progress: TargetProgress
  index: number
  money: MoneyState
  settings: ExpensaveSettings
}) {
  const { locale, savePluginSettings, t } = useStore()
  const [editing, setEditing] = useState(false)
  const { target, saved, pace, projected } = progress
  const amount = (v: number) => fmtMoney(v, locale, money.currency, false)
  const date = longDate(target.date, locale)
  const reached = saved >= target.amount
  const due = target.date <= dayKey(new Date())
  const counts = index === 0

  const saveBalance = async (balance: number) => {
    const next: ExpensaveSettings = {
      ...settings,
      savingsTargets: (settings.savingsTargets ?? []).map((row, j) => (j === index ? { ...row, balance, balanceDate: dayKey(new Date()) } : row)),
    }
    await savePluginSettings('expensave', next)
    setEditing(false)
  }

  return (
    <section className="card mny-target">
      <h2 className="card-title">{target.name || t('money.target.untitled')}</h2>
      <div className="mny-target-head">
        <b className={reached ? 'in' : undefined}>{amount(saved)}</b>
        <span>{t('money.target.of', { amount: amount(target.amount), date })}</span>
      </div>
      <div className="mny-target-bar"><span style={{ width: `${target.amount > 0 ? Math.min(100, (saved / target.amount) * 100) : 0}%` }} /></div>

      {reached
        ? <p className="mny-target-line in">{t('money.target.reached')}</p>
        : due
          ? <p className="mny-target-line out">{t('money.target.missed', { remaining: amount(progress.remaining) })}</p>
          : <p className="mny-target-line">{t('money.target.needed', { perPay: amount(progress.perPay), count: progress.paysLeft + 1 })}</p>}
      {!reached && !due && projected != null && pace != null && (
        <p className={`mny-target-line ${projected >= target.amount ? 'in' : 'out'}`}>
          {projected >= target.amount
            ? t('money.target.onTrack', { pace: amount(pace), projected: amount(projected), date })
            : t('money.target.offTrack', { pace: amount(pace), projected: amount(projected), date, gap: amount(target.amount - projected) })}
        </p>
      )}

      <p className="mny-basis">
        {target.balanceDate == null
          ? t('money.target.noBalance')
          : progress.movedSince !== 0
            ? t('money.target.basisMoved', { balance: amount(target.balance ?? 0), date: longDate(target.balanceDate, locale), moved: amount(progress.movedSince) })
            : t('money.target.basis', { balance: amount(target.balance ?? 0), date: longDate(target.balanceDate, locale) })}
        {pace != null && <> {t('money.target.paceHint')}</>}
      </p>
      {progress.stale && <p className="bank-warn">{t('money.target.stale')}</p>}

      {money.canWrite && (editing
        ? <BalanceForm initial={target.balanceDate ? saved : target.balance} hint={t(counts ? 'money.target.hintFirst' : 'money.target.hintOther')}
            onSave={saveBalance} onCancel={() => setEditing(false)} />
        : <button className="dash-cancel mny-moved" onClick={() => setEditing(true)}>
            {t(target.balanceDate == null ? 'money.target.start' : 'money.target.update')}
          </button>)}
    </section>
  )
}

/** One card per savings target: how far along it is, what each pay needs to put in, and where the recent pace leads. */
export function SavingsTargets({ money, settings }: { money: MoneyState; settings: ExpensaveSettings }) {
  if (!money.targets.length) return null
  return (
    <div className="mny-targets">
      {money.targets.map((progress, i) => (
        <TargetCard key={`${i}:${progress.target.name}`} progress={progress} index={i} money={money} settings={settings} />
      ))}
    </div>
  )
}
