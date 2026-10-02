import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import { usePluginSettings } from '../settings'
import { getImportStatus, ImportError, previewBankImport, readStatementFile, type ImportResult } from './api'
import { BankReview, shortDate } from './BankReview'
import { DEFAULT_IMPORT_EVERY_DAYS, nextImportDue } from './money'
import { useMoney } from './MoneyProvider'
import type { BankImportStatus, BankPreview, ExpensaveSettings } from './types'

const DUE_SOON_DAYS = 2

type ImportStatus = { lastImport: BankImportStatus | null; canWrite: boolean }

function DueReminder({ last, every }: { last: BankImportStatus | null; every: number }) {
  const { locale, now, t } = useStore()
  const due = nextImportDue(last, now, every)
  if (!due) return null
  const urgency = due.days < 0 ? 'late' : due.days <= DUE_SOON_DAYS ? 'soon' : 'ok'
  const text = due.days < 0
    ? t('bank.overdue', { count: -due.days })
    : due.days === 0 ? t('bank.dueToday') : t('bank.due', { date: shortDate(due.due, locale), count: due.days })
  return <p className={`mny-bank-due ${urgency}`}>{text}</p>
}

/** Bank statement sync: upload a CSV export, review, and Expensave matches the bank. */
export function BankImport() {
  const { locale, t } = useStore()
  const { reload } = useMoney()
  const settings = usePluginSettings<ExpensaveSettings>('expensave')
  const every = settings.importEveryDays ?? DEFAULT_IMPORT_EVERY_DAYS
  const [status, setStatus] = useState<ImportStatus | null>(null)
  const [pending, setPending] = useState<{ csv: string; preview: BankPreview } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const loadStatus = useCallback(() => {
    getImportStatus().then(setStatus).catch(() => setStatus(null))
  }, [])
  useEffect(loadStatus, [loadStatus])

  const preview = async (csv: string, account?: string) => {
    setLoading(true)
    setError(null)
    try {
      setPending({ csv, preview: await previewBankImport({ csv, account, calendar: settings.calendars?.[0]?.id }) })
    } catch (e) {
      // a multi-account export previews its first account; the review offers the others
      if (e instanceof ImportError && e.accounts?.length && !account) return preview(csv, e.accounts[0])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // cleared so that picking the same file again still fires
    e.target.value = ''
    if (!file) return
    setResult(null)
    preview(await readStatementFile(file))
  }

  const onDone = (done: ImportResult) => {
    setPending(null)
    setResult(done)
    loadStatus()
    reload()
  }

  const last = status?.lastImport ?? null
  const readOnly = status?.canWrite === false

  return (
    <section className="card mny-bank">
      <h2 className="card-title">{t('bank.title')}</h2>
      <p className="mny-bank-status">
        {last ? t('bank.syncedThrough', { date: shortDate(last.to, locale) }) : t('bank.never', { days: every })}
        {last?.balance != null && <> · {t('bank.balanceSet')}</>}
      </p>
      <DueReminder last={last} every={every} />

      <div className="mny-bank-actions">
        <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
        <button className="dash-save" onClick={() => fileInput.current?.click()} disabled={loading || readOnly}>
          {loading ? t('bank.reading') : t('bank.upload')}
        </button>
      </div>
      {readOnly && <p className="settings-note">{t('bank.readOnly')}</p>}
      {error && <p className="settings-note mny-err">{error}</p>}
      {result && (
        <p className="settings-note">
          {t('bank.result', { matched: result.matched, added: result.added, removed: result.removed })}
          {result.errors.map((e) => <span className="mny-err" key={e}><br />{e}</span>)}
        </p>
      )}

      {pending && (
        <BankReview preview={pending.preview} csv={pending.csv} onDone={onDone}
          onClose={() => setPending(null)} onAccount={(account) => preview(pending.csv, account)} />
      )}
    </section>
  )
}
