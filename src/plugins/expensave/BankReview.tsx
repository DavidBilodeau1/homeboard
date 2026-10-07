import React, { useState } from 'react'
import { CloseIcon } from '../../icons'
import { useStore } from '../../store'
import { applyBankImport, type ImportResult } from './api'
import { fmtMoney } from './money'
import { useMoney } from './MoneyProvider'
import type { BankPlanned, BankPreview } from './types'

type Decision = 'remove' | 'pending'
const DECISIONS: Decision[] = ['remove', 'pending']

export const shortDate = (day: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(`${day}T00:00:00`))

/** "1 234,56", "1,234.56", "$1234.5" → 1234.56; null when it is not a number. */
const parseAmount = (text: string): number | null => {
  const compact = text.replace(/[\s$\u00a0]/g, '')
  if (!compact) return null
  const decimalComma = /,\d{1,2}$/.test(compact)
  const value = Number(decimalComma ? compact.replace(/\./g, '').replace(',', '.') : compact.replace(/,/g, ''))
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null
}

const sign = (amount: number) => (amount >= 0 ? 'in' : 'out')

function useFormat() {
  const { locale } = useStore()
  const { money } = useMoney()
  return (amount: number) => fmtMoney(amount, locale, money?.currency ?? 'CAD')
}

function BalanceSection({ preview, text, onText, busy }: { preview: BankPreview; text: string; onText: (text: string) => void; busy: boolean }) {
  const { locale, t } = useStore()
  const format = useFormat()
  const balance = parseAmount(text)
  const correction = balance == null ? null : Math.round((balance - preview.balanceAfter) * 100) / 100
  return (
    <section className="bank-balance">
      <label className="bank-field">
        <span>{t('bank.balanceLabel', { date: shortDate(preview.to, locale) })}</span>
        <input inputMode="decimal" placeholder="0.00" value={text} onChange={(e) => onText(e.target.value)} disabled={busy} autoFocus />
      </label>
      <div className="bank-balance-math">
        <div><span>{t('bank.expensaveAfter')}</span><b>{format(preview.balanceAfter)}</b></div>
        {!!correction && (
          <div><span>{t('bank.correction')}</span><b className={correction > 0 ? 'in' : 'out'}>{correction > 0 ? '+' : ''}{format(correction)}</b></div>
        )}
      </div>
      <p className="settings-note">{balance == null ? t('bank.balanceMissing') : t('bank.balanceHint')}</p>
    </section>
  )
}

function MissingSection({ missing, decisions, onDecide, busy }: {
  missing: BankPlanned[]
  decisions: Record<number, Decision>
  onDecide: (id: number, decision: Decision) => void
  busy: boolean
}) {
  const { locale, t } = useStore()
  const format = useFormat()
  return (
    <section className="bank-section">
      <h4>{t('bank.missing', { count: missing.length })}</h4>
      <p className="settings-note">{t('bank.missingHint')}</p>
      {missing.map((entry) => (
        <div className="bank-row" key={entry.id}>
          <span className="bank-day">{shortDate(entry.date, locale)}</span>
          <span className="bank-label">{entry.label}{entry.recurring && <em className="mny-tag">↻</em>}</span>
          <span className={`mny-amt ${sign(entry.amount)}`}>{format(entry.amount)}</span>
          <span className="bank-choice">
            {DECISIONS.map((decision) => (
              <button key={decision} className={decisions[entry.id] === decision ? 'active' : ''} disabled={busy}
                onClick={() => onDecide(entry.id, decision)}>{t(`bank.${decision}`)}</button>
            ))}
          </span>
        </div>
      ))}
    </section>
  )
}

function MatchedSection({ matched }: { matched: BankPreview['matched'] }) {
  const { locale, t } = useStore()
  const format = useFormat()
  return (
    <details className="bank-section">
      <summary>{t('bank.matched', { count: matched.length })}</summary>
      {matched.map(({ entry, rows }) => (
        <div className="bank-row matched" key={entry.id}>
          <span className="bank-day">{shortDate(rows[0].date, locale)}</span>
          <span className="bank-label">{entry.label}<small>{rows.map((r) => r.raw).join(' + ')}</small></span>
          <span className={`mny-amt ${sign(entry.amount)}`}>{format(rows.reduce((sum, r) => sum + r.amount, 0))}</span>
        </div>
      ))}
    </details>
  )
}

function AddedSection({ added }: { added: BankPreview['added'] }) {
  const { locale, t } = useStore()
  const format = useFormat()
  return (
    <details className="bank-section">
      <summary>{t('bank.added', { count: added.length })}</summary>
      {added.map((row, i) => (
        <div className="bank-row" key={`${row.date}${row.raw}${i}`}>
          <span className="bank-day">{shortDate(row.date, locale)}</span>
          <span className="bank-label" title={row.raw}>{row.label}{row.category && <em className="mny-tag">{row.category}</em>}</span>
          <span className={`mny-amt ${sign(row.amount)}`}>{format(row.amount)}</span>
        </div>
      ))}
    </details>
  )
}

interface Props {
  preview: BankPreview
  csv: string
  onClose: () => void
  onDone: (result: ImportResult) => void
  onAccount: (account: string) => void
}

/** Everything a statement upload would change, confirmed before anything is written. */
export function BankReview({ preview, csv, onClose, onDone, onAccount }: Props) {
  const { locale, t } = useStore()
  const [balanceText, setBalanceText] = useState(preview.bankBalance != null ? String(preview.bankBalance) : '')
  const [decisions, setDecisions] = useState<Record<number, Decision>>(() => Object.fromEntries(preview.missing.map((m) => [m.id, m.action])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const balance = parseAmount(balanceText)
  const changesSomething = preview.matched.length > 0 || preview.added.length > 0 || balance != null ||
    preview.missing.some((m) => decisions[m.id] === 'remove' || m.confirmed)

  const apply = async () => {
    setBusy(true)
    setError(null)
    try {
      onDone(await applyBankImport({ csv, calendar: preview.calendar.id, account: preview.account, balance, decisions }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="modal bank-modal" onClick={busy ? undefined : onClose}>
      <div className="modal-box bank-box" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>{t('bank.reviewTitle')}</h3>
          <span className="bank-range">
            {t('bank.range', { from: shortDate(preview.from, locale), to: shortDate(preview.to, locale), count: preview.count })}
          </span>
          <button className="modal-close" onClick={onClose} disabled={busy} aria-label={t('modal.close')}><CloseIcon size={20} /></button>
        </header>

        <div className="bank-body">
          {preview.accounts.length > 1 && (
            <label className="bank-field">
              <span>{t('bank.account')}</span>
              <select value={preview.account} onChange={(e) => onAccount(e.target.value)} disabled={busy}>
                {preview.accounts.map((account) => <option key={account} value={account}>{account}</option>)}
              </select>
            </label>
          )}
          <BalanceSection preview={preview} text={balanceText} onText={setBalanceText} busy={busy} />
          {preview.gapDays > 0 && preview.lastImport && (
            <p className="bank-warn">{t('bank.gap', { count: preview.gapDays, days: preview.gapDays, date: shortDate(preview.lastImport.to, locale) })}</p>
          )}
          {preview.missing.length > 0 && (
            <MissingSection missing={preview.missing} decisions={decisions} busy={busy}
              onDecide={(id, decision) => setDecisions((current) => ({ ...current, [id]: decision }))} />
          )}
          {preview.matched.length > 0 && <MatchedSection matched={preview.matched} />}
          {preview.added.length > 0 && <AddedSection added={preview.added} />}
          {preview.duplicates > 0 && <p className="settings-note">{t('bank.duplicates', { count: preview.duplicates })}</p>}
          {error && <p className="settings-note mny-err">{error}</p>}
        </div>

        <footer className="bank-foot">
          <span className="settings-note">{t('bank.into', { calendar: preview.calendar.name })}</span>
          <button className="dash-cancel" onClick={onClose} disabled={busy}>{t('bank.cancel')}</button>
          <button className="dash-save" onClick={apply} disabled={busy || !preview.canWrite || !changesSomething}>
            {busy ? t('bank.applying') : t('bank.apply')}
          </button>
        </footer>
      </div>
    </div>
  )
}
