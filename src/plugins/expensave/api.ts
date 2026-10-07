import { getJson, pluginUrl } from '../../api'
import type { BankImportStatus, BankPreview, ExpensaveCalendar, MoneyPayload } from './types'

const url = (path: string) => pluginUrl('expensave', path)

export const getExpensaveCalendars = (): Promise<ExpensaveCalendar[]> => getJson(url('calendars'))

export const getExpensaveRange = (ids: number[], start: string, end: string): Promise<MoneyPayload> =>
  getJson(url(`expenses?calendars=${ids.join(',')}&start=${start}&end=${end}`))

/** Error from the import endpoints; `accounts` is set when the file needs one picked. */
export class ImportError extends Error {
  constructor(message: string, readonly accounts?: string[]) {
    super(message)
  }
}

async function importCall<T>(path: string, body?: unknown): Promise<T> {
  const init = body === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
  const r = await fetch(url(`import/${path}`), init)
  const data = await r.json().catch(() => null)
  // 207: applied, with some writes listed as failed
  if (!r.ok && r.status !== 207) throw new ImportError(data?.error ?? `HTTP ${r.status}`, data?.accounts)
  return data
}

export interface ImportRequest {
  csv: string
  calendar?: number
  account?: string
}

export type ImportResult = BankImportStatus & { errors: string[] }

export const getImportStatus = () => importCall<{ lastImport: BankImportStatus | null; canWrite: boolean }>('status')

export const previewBankImport = (request: ImportRequest) => importCall<BankPreview>('preview', request)

export const applyBankImport = (request: ImportRequest & { balance?: number | null; decisions?: Record<number, 'remove' | 'pending'> }) =>
  importCall<ImportResult>('apply', request)

/** Bank exports are UTF-8 these days, older ones Windows-1252. */
export async function readStatementFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}
