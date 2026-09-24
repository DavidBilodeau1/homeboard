import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import { balanceAfter, cleanLabel, guessCategory, parseBankCsv, parseCsv, reconcile, tagOf, withTag } from './bankImport.js'
import { expensaveRouter } from './expensave.js'
import { expensaveMockApi } from './expensaveMock.js'

const HEAD = "Type de compte,Numéro du compte,Date de l'opération,Numéro du chèque,Description 1,Description 2,CAD$,USD$"
const csv = (...lines) => `\uFEFF${HEAD}\n${lines.map((l) => `Chèques,00000-1234567,${l}`).join('\n')}\n`

const entry = (id, date, label, amount, extra = {}) => ({
  id, label, amount, confirmed: true, description: null, createdAt: `${date} 21:00:00`,
  category: { id: 15, name: 'Uncategorized', type: 'uncategorized' }, ...extra,
})

describe('parseCsv', () => {
  it('handles quotes, doubled quotes and CRLF', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n')).toEqual([['a', 'b, c', 'say "hi"'], ['1', '2', '3']])
  })
})

describe('parseBankCsv', () => {
  it('reads the Desjardins export (BOM, M/D/YYYY, signed CAD$)', () => {
    const { accounts, rows } = parseBankCsv(csv(
      '9/10/2026,,ACHAT INTERAC SANS CONTACT - 2570 SQ *CENDRILLON,,-55.19,',
      '9/18/2026,,DÉPÔT DE PAIE PAIE/PAYROLL,,2268.39,',
    ))
    expect(accounts).toEqual(['Chèques 00000-1234567'])
    expect(rows.map((r) => [r.date, r.amount, r.label])).toEqual([
      ['2026-09-10', -55.19, 'SQ *CENDRILLON'],
      ['2026-09-18', 2268.39, 'DÉPÔT DE PAIE PAIE/PAYROLL'],
    ])
  })

  it('gives identical rows distinct, stable fingerprints', () => {
    const a = parseBankCsv(csv('9/21/2026,,TIM HORTONS,,-6.66,', '9/21/2026,,TIM HORTONS,,-6.66,')).rows
    const b = parseBankCsv(csv('9/20/2026,,OTHER,,-1,', '9/21/2026,,TIM HORTONS,,-6.66,', '9/21/2026,,TIM HORTONS,,-6.66,')).rows
    expect(a[0].fp).not.toBe(a[1].fp)
    expect(b.slice(1).map((r) => r.fp)).toEqual(a.map((r) => r.fp))
  })

  it('reads the real sample export end to end', () => {
    const file = path.join(import.meta.dirname, '../download-transactions.csv')
    if (!fs.existsSync(file)) return
    const { rows } = parseBankCsv(fs.readFileSync(file, 'utf8'))
    expect(rows.length).toBe(77)
    expect(new Set(rows.map((r) => r.fp)).size).toBe(77)
  })

  it('supports separate withdrawal/deposit columns and a balance', () => {
    const { rows } = parseBankCsv('Date,Description,Retrait,Dépôt,Solde\n2026-09-01,Café,"4,50",,"1 000,00"\n2026-09-02,Paie,,100,1095.5\n')
    expect(rows.map((r) => [r.amount, r.balance])).toEqual([[-4.5, 1000], [100, 1095.5]])
  })

  it('rejects files it cannot understand', () => {
    expect(() => parseBankCsv('foo,bar\n1,2\n')).toThrow(/Unrecognised/)
  })
})

describe('cleanLabel', () => {
  it('drops card-purchase prefixes and reference numbers', () => {
    expect(cleanLabel('ACHAT VISA DÉBIT - 2415 PAYPAL *APPLE.C')).toBe('PAYPAL *APPLE.C')
    expect(cleanLabel('VIREMENT PAR BANQUE EN DIRECT - 2866')).toBe('VIREMENT PAR BANQUE EN DIRECT')
    expect(cleanLabel('ACHAT INTERAC')).toBe('ACHAT INTERAC')
  })
})

describe('guessCategory', () => {
  const cats = [{ id: 4, name: 'Groceries', type: 'user' }, { id: 5, name: 'Eating out', type: 'user' }]
  it('maps keywords to existing categories and skips missing ones', () => {
    expect(guessCategory({ raw: 'ACHAT INTERAC - 7741 COSTCO WHOLESAL' }, cats)).toBe(4)
    expect(guessCategory({ raw: 'CAFE STARBUCKS' }, cats)).toBe(5)
    expect(guessCategory({ raw: 'PHARMAPRIX' }, cats)).toBe(null)
  })
})

describe('reconcile', () => {
  const rows = parseBankCsv(csv(
    '9/10/2026,,PRÊT CAISSE CHICOUTI,,-390,',
    '9/15/2026,,PAIEMENT DIVERS VILLE SAGUENAY,,-327,',
    '9/17/2026,,ASSURANCE LA PERSONNELLE,,-535.3,',
    '9/21/2026,,ACHAT INTERAC - 2143 RESERVE DE BOIS,,-266.21,',
    '9/21/2026,,ACHAT INTERAC SANS CONTACT - 8013 SQ *FONDATION D,,-13.8,',
    '9/22/2026,,PAIEMENT DIVERS FED.CAISSES DES,,-254.33,',
    '9/22/2026,,PAIEMENT DIVERS FED.CAISSES DES,,-145.38,',
    '9/24/2026,,ACHAT INTERAC,,-61.53,',
  )).rows
  const entries = [
    entry(1, '2026-09-11', 'Maison', -390, { recurring: true }),
    entry(2, '2026-09-17', 'Hydro', -327),
    entry(3, '2026-09-17', 'La personnelle', -535.29),
    entry(4, '2026-09-21', 'Epicerie', -280),
    entry(5, '2026-09-20', 'Moto', -399.71),
    entry(6, '2026-09-12', 'Carte credit', -1000),
    entry(7, '2026-09-23', 'Canlife', -55.71),
    entry(8, '2026-09-25', 'Maison', -390, { recurring: true }),
    entry(9, '2026-09-15', 'Balance Update', 50, { category: { id: 99, type: 'balance_update' } }),
  ]
  const plan = reconcile(rows, entries)
  const matchedIds = plan.matched.map((m) => m.entry.id)

  it('lines planned bills up with the bank, a few days and cents apart', () => {
    expect(matchedIds).toEqual(expect.arrayContaining([1, 2, 3]))
  })

  it('matches a bill paid in two parts to the same payee, but not any two purchases', () => {
    expect(plan.matched.find((m) => m.entry.id === 5)?.rows.map((r) => r.amount)).toEqual([-254.33, -145.38])
    expect(matchedIds).not.toContain(4)
  })

  it('adds what matches nothing', () => {
    expect(plan.added.map((r) => r.amount)).toEqual([-266.21, -13.8, -61.53])
  })

  it('proposes removing stale plan entries and keeping recent ones pending', () => {
    expect(plan.missing.map((m) => [m.id, m.action])).toEqual([[6, 'remove'], [4, 'remove'], [7, 'pending']])
  })

  it('never touches balance updates or entries after the statement', () => {
    expect([...matchedIds, ...plan.missing.map((m) => m.id)]).not.toContain(9)
    expect([...matchedIds, ...plan.missing.map((m) => m.id)]).not.toContain(8)
  })

  it('skips rows a previous import already wrote', () => {
    const again = reconcile(rows, [...entries, entry(20, '2026-09-24', 'ACHAT INTERAC', -61.53, { description: withTag('x', rows[7].fp) })])
    expect(again.duplicates).toBe(1)
    expect(again.added.map((r) => r.amount)).toEqual([-266.21, -13.8])
  })

  it('computes the balance Expensave will show once applied', () => {
    // base 1000; kept: balance update +50 (9/15); everything else is replaced by the bank
    const bank = rows.reduce((s, r) => s + r.amount, 0)
    expect(balanceAfter(plan, entries, 1000)).toBe(Math.round((1000 + 50 + bank) * 100) / 100)
  })

  it('reads tags back', () => {
    expect(tagOf({ description: withTag('RAW', 'abcdef0123') })).toBe('abcdef0123')
    expect(tagOf({ description: 'no tag' })).toBe(null)
  })
})

describe('import routes (demo ledger)', () => {
  let server
  let base
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-import-'))
  const stateFile = path.join(dir, 'bank-import.json')
  const today = new Date(2026, 8, 24)
  const statement = csv(
    '9/18/2026,,ACHAT INTERAC SANS CONTACT - 4418 CAFE STARBUCKS,,-17.84,',
    '9/21/2026,,ACHAT INTERAC - 7741 COSTCO WHOLESAL,,-230.13,',
    '9/23/2026,,DÉPÔT DE PAIE PAIE/PAYROLL,,2268.39,',
  )
  const post = (url, body) => fetch(`${base}${url}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }))

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use('/x', expensaveRouter(expensaveMockApi(() => today), { stateFile }))
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    base = `http://127.0.0.1:${server.address().port}`
  })
  afterAll(() => server?.close())

  it('previews without writing, applies, then reports the bank balance', async () => {
    const preview = await post('/x/import/preview', { csv: statement, calendar: 1 })
    expect(preview.status).toBe(200)
    expect(preview.body.count).toBe(3)
    expect(preview.body.from).toBe('2026-09-18')
    expect(preview.body.added.find((r) => r.label === 'COSTCO WHOLESAL')?.category).toBe('Groceries')
    expect(fs.existsSync(stateFile)).toBe(false)

    const applied = await post('/x/import/apply', { csv: statement, calendar: 1, balance: 1234.56 })
    expect(applied.status).toBe(200)
    expect(applied.body.errors).toEqual([])
    expect(JSON.parse(fs.readFileSync(stateFile, 'utf8')).to).toBe('2026-09-23')

    const ledger = await fetch(`${base}/x/expenses?calendars=1&start=2026-09-01&end=2026-09-30`).then((r) => r.json())
    expect(ledger.days.find((d) => d.date === '2026-09-23').balance).toBe(1234.56)

    // the same file again changes nothing
    const again = await post('/x/import/preview', { csv: statement, calendar: 1 })
    expect(again.body.duplicates).toBe(3)
    expect(again.body.added).toEqual([])
    // only what was left "still coming" is up for review again
    expect(again.body.missing.every((m) => m.action === 'pending' && !m.confirmed)).toBe(true)
    expect(again.body.gapDays).toBe(0)
  })

  it('refuses to write on a read-only panel', async () => {
    const app = express()
    app.use(express.json())
    app.use('/x', expensaveRouter(expensaveMockApi(() => today), { stateFile, canWrite: false }))
    const ro = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)) })
    const r = await fetch(`http://127.0.0.1:${ro.address().port}/x/import/apply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: statement }),
    })
    ro.close()
    expect(r.status).toBe(403)
  })

  it('explains a bad file', async () => {
    const r = await post('/x/import/preview', { csv: 'nope' })
    expect(r.status).toBe(400)
    expect(r.body.error).toBeTruthy()
  })
})
