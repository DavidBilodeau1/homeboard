import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import {
  applyBankImport, fmtMoney, getImportStatus, ImportError, nextImportDue, previewBankImport, readStatementFile,
  DEFAULT_IMPORT_EVERY_DAYS,
} from '../expensave'
import type { BankImportStatus, BankPreview } from '../types'
import { CloseIcon } from '../icons'

/**
 * Bank statement sync for the Money page.
 *
 * Every two weeks: download the last 14 days of the chequing account as CSV,
 * drop it here, check the review, type the balance the bank shows. Expensave
 * then holds what actually happened (planned bills matched, purchases added,
 * plan lines that never happened removed) and its running balance is the
 * bank's — which is what makes "safe to set aside" trustworthy.
 */

type Decision = 'remove' | 'pending'

const shortDate = (day: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(`${day}T00:00:00`))

/** "1 234,56", "1,234.56", "$1234.5" → 1234.56; null when it is not a number. */
const parseAmount = (s: string): number | null => {
  const t = s.replace(/[\s$\u00a0]/g, '')
  if (!t) return null
  const v = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''))
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null
}

function Review({ preview, csv, onClose, onDone, onAccount }: {
  preview: BankPreview
  csv: string
  onClose: () => void
  onDone: (result: BankImportStatus & { errors: string[] }) => void
  onAccount: (account: string) => void
}) {
  const { locale, t, money } = useStore()
  const currency = money?.currency ?? 'CAD'
  const fmt = (v: number) => fmtMoney(v, locale, currency)
  const [balanceText, setBalanceText] = useState(preview.bankBalance != null ? String(preview.bankBalance) : '')
  const [decisions, setDecisions] = useState<Record<number, Decision>>(
    () => Object.fromEntries(preview.missing.map((m) => [m.id, m.action])),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const balance = parseAmount(balanceText)
  const correction = balance == null ? null : Math.round((balance - preview.balanceAfter) * 100) / 100
  const nothingToDo = !preview.matched.length && !preview.added.length &&
    !preview.missing.some((m) => decisions[m.id] === 'remove' || m.confirmed) && balance == null

  const apply = async () => {
    setBusy(true)
    setError(null)
    try {
      onDone(await applyBankImport({
        csv, calendar: preview.calendar.id, account: preview.account, balance, decisions,
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="fg-modal bank-modal" onClick={busy ? undefined : onClose}>
      <div className="fg-modal-box bank-box" onClick={(e) => e.stopPropagation()}>
        <header className="fg-modal-head">
          <h3>{t('bank.reviewTitle')}</h3>
          <span className="bank-range">
            {t('bank.range', { from: shortDate(preview.from, locale), to: shortDate(preview.to, locale), count: preview.count })}
          </span>
          <button className="fg-modal-close" onClick={onClose} disabled={busy} aria-label={t('frigate.close')}>
            <CloseIcon size={20} />
          </button>
        </header>

        <div className="bank-body">
          {preview.accounts.length > 1 && (
            <label className="bank-field">
              <span>{t('bank.account')}</span>
              <select value={preview.account} onChange={(e) => onAccount(e.target.value)} disabled={busy}>
                {preview.accounts.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
          )}

          <section className="bank-balance">
            <label className="bank-field">
              <span>{t('bank.balanceLabel', { date: shortDate(preview.to, locale) })}</span>
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={balanceText}
                onChange={(e) => setBalanceText(e.target.value)}
                disabled={busy}
                autoFocus
              />
            </label>
            <div className="bank-balance-math">
              <div><span>{t('bank.expensaveAfter')}</span><b>{fmt(preview.balanceAfter)}</b></div>
              {correction != null && correction !== 0 && (
                <div><span>{t('bank.correction')}</span><b className={correction > 0 ? 'in' : 'out'}>{correction > 0 ? '+' : ''}{fmt(correction)}</b></div>
              )}
            </div>
            <p className="settings-note">{balance == null ? t('bank.balanceMissing') : t('bank.balanceHint')}</p>
          </section>

          {preview.gapDays > 0 && (
            <p className="bank-warn">{t('bank.gap', { count: preview.gapDays, days: preview.gapDays, date: shortDate(preview.lastImport!.to, locale) })}</p>
          )}

          {preview.missing.length > 0 && (
            <section className="bank-section">
              <h4>{t('bank.missing', { count: preview.missing.length })}</h4>
              <p className="settings-note">{t('bank.missingHint')}</p>
              {preview.missing.map((m) => (
                <div className="bank-row" key={m.id}>
                  <span className="bank-day">{shortDate(m.date, locale)}</span>
                  <span className="bank-label">{m.label}{m.recurring && <em className="mny-tag">↻</em>}</span>
                  <span className={`mny-amt ${m.amount >= 0 ? 'in' : 'out'}`}>{fmt(m.amount)}</span>
                  <span className="bank-choice">
                    {(['remove', 'pending'] as const).map((d) => (
                      <button
                        key={d}
                        className={decisions[m.id] === d ? 'active' : ''}
                        onClick={() => setDecisions((s) => ({ ...s, [m.id]: d }))}
                        disabled={busy}
                      >{t(`bank.${d}`)}</button>
                    ))}
                  </span>
                </div>
              ))}
            </section>
          )}

          {preview.matched.length > 0 && (
            <details className="bank-section">
              <summary>{t('bank.matched', { count: preview.matched.length })}</summary>
              {preview.matched.map((m) => (
                <div className="bank-row matched" key={m.entry.id}>
                  <span className="bank-day">{shortDate(m.rows[0].date, locale)}</span>
                  <span className="bank-label">
                    {m.entry.label}
                    <small>{m.rows.map((r) => r.raw).join(' + ')}</small>
                  </span>
                  <span className={`mny-amt ${m.entry.amount >= 0 ? 'in' : 'out'}`}>
                    {fmt(m.rows.reduce((s, r) => s + r.amount, 0))}
                  </span>
                </div>
              ))}
            </details>
          )}

          {preview.added.length > 0 && (
            <details className="bank-section">
              <summary>{t('bank.added', { count: preview.added.length })}</summary>
              {preview.added.map((r, i) => (
                <div className="bank-row" key={`${r.date}${r.raw}${i}`}>
                  <span className="bank-day">{shortDate(r.date, locale)}</span>
                  <span className="bank-label" title={r.raw}>
                    {r.label}
                    {r.category && <em className="mny-tag">{r.category}</em>}
                  </span>
                  <span className={`mny-amt ${r.amount >= 0 ? 'in' : 'out'}`}>{fmt(r.amount)}</span>
                </div>
              ))}
            </details>
          )}

          {preview.duplicates > 0 && <p className="settings-note">{t('bank.duplicates', { count: preview.duplicates })}</p>}
          {error && <p className="settings-note mny-err">{error}</p>}
        </div>

        <footer className="bank-foot">
          <span className="settings-note">{t('bank.into', { calendar: preview.calendar.name })}</span>
          <button className="dash-cancel" onClick={onClose} disabled={busy}>{t('bank.cancel')}</button>
          <button className="dash-save" onClick={apply} disabled={busy || !preview.canWrite || nothingToDo}>
            {busy ? t('bank.applying') : t('bank.apply')}
          </button>
        </footer>
      </div>
    </div>
  )
}

export function BankImport() {
  const { locale, t, config, now, reloadMoney } = useStore()
  const every = config?.expensave?.importEveryDays ?? DEFAULT_IMPORT_EVERY_DAYS
  const [status, setStatus] = useState<{ lastImport: BankImportStatus | null; canWrite: boolean } | null>(null)
  const [pending, setPending] = useState<{ csv: string; preview: BankPreview } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<(BankImportStatus & { errors: string[] }) | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const loadStatus = useCallback(() => {
    getImportStatus().then(setStatus).catch(() => setStatus(null))
  }, [])
  useEffect(loadStatus, [loadStatus])

  const preview = async (csv: string, account?: string) => {
    setLoading(true)
    setError(null)
    try {
      setPending({ csv, preview: await previewBankImport({ csv, account, calendar: config?.expensave?.calendars?.[0]?.id }) })
    } catch (e) {
      // a multi-account export: preview the first, the review offers the others
      if (e instanceof ImportError && e.accounts?.length && !account) return preview(csv, e.accounts[0])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // picking the same file again must fire again
    if (!file) return
    setResult(null)
    preview(await readStatementFile(file))
  }

  const last = status?.lastImport ?? null
  const due = nextImportDue(last, now, every)
  const dueClass = !due ? 'none' : due.days < 0 ? 'late' : due.days <= 2 ? 'soon' : 'ok'

  return (
    <section className="card mny-bank">
      <h2 className="card-title">{t('bank.title')}</h2>

      {last ? (
        <p className="mny-bank-status">
          {t('bank.syncedThrough', { date: shortDate(last.to, locale) })}
          {last.balance != null && <> · {t('bank.balanceSet')}</>}
        </p>
      ) : (
        <p className="mny-bank-status">{t('bank.never', { days: every })}</p>
      )}
      {due && (
        <p className={`mny-bank-due ${dueClass}`}>
          {due.days < 0
            ? t('bank.overdue', { count: -due.days })
            : due.days === 0 ? t('bank.dueToday') : t('bank.due', { date: shortDate(due.due, locale), count: due.days })}
        </p>
      )}

      <div className="mny-bank-actions">
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
        <button
          className="dash-save"
          onClick={() => input.current?.click()}
          disabled={loading || status?.canWrite === false}
        >{loading ? t('bank.reading') : t('bank.upload')}</button>
      </div>
      {status?.canWrite === false && <p className="settings-note">{t('bank.readOnly')}</p>}
      {error && <p className="settings-note mny-err">{error}</p>}
      {result && (
        <p className="settings-note">
          {t('bank.result', { matched: result.matched, added: result.added, removed: result.removed })}
          {result.errors.map((e) => <span className="mny-err" key={e}><br />{e}</span>)}
        </p>
      )}

      {pending && (
        <Review
          preview={pending.preview}
          csv={pending.csv}
          onClose={() => setPending(null)}
          onAccount={(account) => preview(pending.csv, account)}
          onDone={(r) => {
            setPending(null)
            setResult(r)
            loadStatus()
            reloadMoney()
          }}
        />
      )}
    </section>
  )
}
