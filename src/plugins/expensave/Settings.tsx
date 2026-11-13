import React, { useEffect, useState } from 'react'
import { Field, Note, NumberField } from '../../components/editor/Field'
import { useStore } from '../../store'
import { addDays, dayKey } from '../../util'
import type { SettingsPanelProps } from '../types'
import { getExpensaveCalendars } from './api'
import { calendarColor, DEFAULT_CURRENCY, DEFAULT_HORIZON_DAYS, DEFAULT_IMPORT_EVERY_DAYS } from './money'
import type { ExpensaveCalendar, ExpensaveCalendarCfg, ExpensaveSettings, SavingsTarget } from './types'

/** Ticks the Expensave calendars to follow and names and colors each one. */
function CalendarPicker({ settings, onChange }: { settings: ExpensaveSettings; onChange: (rows: ExpensaveCalendarCfg[]) => void }) {
  const { t } = useStore()
  const [calendars, setCalendars] = useState<ExpensaveCalendar[] | null>(null)
  useEffect(() => { getExpensaveCalendars().then(setCalendars).catch(() => setCalendars([])) }, [])

  if (!calendars) return <Note>{t('money.loading')}</Note>
  if (!calendars.length) return <Note>{t('money.settings.none')}</Note>

  const rows = settings.calendars ?? []
  const patch = (id: number, change: Partial<ExpensaveCalendarCfg>) => onChange(rows.map((row) => (row.id === id ? { ...row, ...change } : row)))
  const toggle = (calendar: ExpensaveCalendar, index: number) => onChange(rows.some((row) => row.id === calendar.id)
    ? rows.filter((row) => row.id !== calendar.id)
    : [...rows, { id: calendar.id, name: calendar.name, color: calendarColor(settings, calendar.id, index) }])

  return (
    <div className="ed-rows">
      {calendars.map((calendar, index) => {
        const row = rows.find((r) => r.id === calendar.id)
        return (
          <div className="ed-row" key={calendar.id}>
            <label className={`ed-check${row ? ' on' : ''}`}>
              <input type="checkbox" checked={!!row} onChange={() => toggle(calendar, index)} />
              <span>{calendar.name}</span>
            </label>
            {row && (
              <>
                <input className="ed-input" value={row.name ?? ''} placeholder={calendar.name} onChange={(e) => patch(calendar.id, { name: e.target.value })} />
                <input type="color" className="ed-color" value={row.color ?? calendarColor(settings, calendar.id, index)} title={t('settings.color')}
                  onChange={(e) => patch(calendar.id, { color: e.target.value })} />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Savings targets: a name, an amount, a date, and the account balance as last checked. */
function TargetsEditor({ targets, onChange }: { targets: SavingsTarget[]; onChange: (rows: SavingsTarget[]) => void }) {
  const { t } = useStore()
  const patch = (i: number, change: Partial<SavingsTarget>) => onChange(targets.map((row, j) => (j === i ? { ...row, ...change } : row)))
  return (
    <div className="ed-rows">
      {targets.map((row, i) => (
        <div className="mny-target-edit" key={i}>
          <Field label={t('settings.name')}>
            <input className="ed-input" value={row.name} onChange={(e) => patch(i, { name: e.target.value })} />
          </Field>
          <NumberField label={t('money.settings.targetAmount')} min={0} step={500} value={row.amount}
            onChange={(amount) => patch(i, { amount: amount ?? 0 })} />
          <Field label={t('money.settings.targetDate')}>
            <input className="ed-input" type="date" value={row.date} onChange={(e) => patch(i, { date: e.target.value })} />
          </Field>
          <NumberField label={t('money.settings.targetBalance')} min={0} step={100} value={row.balance}
            onChange={(balance) => patch(i, { balance, balanceDate: balance == null ? undefined : row.balanceDate ?? dayKey(new Date()) })} />
          <Field label={t('money.settings.targetBalanceDate')}>
            <input className="ed-input" type="date" value={row.balanceDate ?? ''}
              onChange={(e) => patch(i, { balanceDate: e.target.value || undefined })} />
          </Field>
          <button className="ed-del" onClick={() => onChange(targets.filter((_, j) => j !== i))} aria-label={t('settings.remove')}>✕</button>
        </div>
      ))}
      <button className="ed-add" onClick={() => onChange([...targets, { name: '', amount: 0, date: dayKey(addDays(new Date(), 180)) }])}>
        + {t('settings.add')}
      </button>
    </div>
  )
}

export function ExpensaveSettingsPanel({ settings, onChange }: SettingsPanelProps<ExpensaveSettings>) {
  const { t } = useStore()
  const set = (change: Partial<ExpensaveSettings>) => onChange({ ...settings, ...change })
  return (
    <div className="ed-fields">
      <Note>{t('money.settings.hint')}</Note>
      <CalendarPicker settings={settings} onChange={(calendars) => set({ calendars: calendars.length ? calendars : undefined })} />
      <Field label={t('money.settings.currency')}>
        <input className="ed-input" value={settings.currency ?? ''} placeholder={DEFAULT_CURRENCY} onChange={(e) => set({ currency: e.target.value || undefined })} />
      </Field>
      <NumberField label={t('money.settings.horizon')} min={1} max={180} value={settings.horizonDays} fallback={DEFAULT_HORIZON_DAYS}
        onChange={(horizonDays) => set({ horizonDays })} />
      <NumberField label={t('money.settings.goal')} min={0} step={50} value={settings.payGoal}
        onChange={(payGoal) => set({ payGoal })} />
      <NumberField label={t('money.settings.buffer')} min={0} step={50} value={settings.buffer} fallback={0}
        onChange={(buffer) => set({ buffer })} />
      <Note>{t('money.settings.goalHint')}</Note>
      <Field label={t('money.settings.targets')}>
        <TargetsEditor targets={settings.savingsTargets ?? []}
          onChange={(rows) => set({ savingsTargets: rows.length ? rows : undefined })} />
      </Field>
      <Note>{t('money.settings.targetsHint')}</Note>
      <NumberField label={t('money.settings.importEvery')} min={1} max={90} value={settings.importEveryDays} fallback={DEFAULT_IMPORT_EVERY_DAYS}
        onChange={(importEveryDays) => set({ importEveryDays })} />
      <Field label={t('money.settings.show')}>
        <input type="checkbox" checked={settings.showInCalendar ?? true} onChange={(e) => set({ showInCalendar: e.target.checked ? undefined : false })} />
      </Field>
    </div>
  )
}
