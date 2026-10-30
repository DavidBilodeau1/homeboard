import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import {
  balanceAfter, cleanLabel, entryKind, findTwins, guessCategory, parseBankCsv, parseCsv, planSince, reconcile,
  recurringCandidates, tagOf, withTag,
} from './bankImport.js'
import { expensaveRouter } from './router.js'
import { expensaveMockApi } from './mock.js'

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
      '9/10/2026,,ACHAT INTERAC SANS CONTACT - 2570 SQ *CORNER BAKERY,,-23.4,',
      '9/18/2026,,DÉPÔT DE PAIE PAIE/PAYROLL,,1850,',
    ))
    expect(accounts).toEqual(['Chèques 00000-1234567'])
    expect(rows.map((r) => [r.date, r.amount, r.label])).toEqual([
      ['2026-09-10', -23.4, 'SQ *CORNER BAKERY'],
      ['2026-09-18', 1850, 'DÉPÔT DE PAIE PAIE/PAYROLL'],
    ])
  })

  it('gives identical rows distinct, stable fingerprints', () => {
    const a = parseBankCsv(csv('9/21/2026,,TIM HORTONS,,-4.35,', '9/21/2026,,TIM HORTONS,,-4.35,')).rows
    const b = parseBankCsv(csv('9/20/2026,,OTHER,,-1,', '9/21/2026,,TIM HORTONS,,-4.35,', '9/21/2026,,TIM HORTONS,,-4.35,')).rows
    expect(a[0].fp).not.toBe(a[1].fp)
    expect(b.slice(1).map((r) => r.fp)).toEqual(a.map((r) => r.fp))
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

  it('tells a paycheque from a "PAIEMENT" charge', () => {
    const income = [{ id: 3, name: 'Income', type: 'user' }]
    expect(guessCategory({ raw: 'DÉPÔT DE PAIE PAIE/PAYROLL' }, income)).toBe(3)
    expect(guessCategory({ raw: 'PAIEMENT DIVERS ACME TRANSFER' }, income)).toBe(null)
  })
})

/** An entry a previous upload wrote for `raw`: named after it unless it confirmed a plan entry. */
const imported = (id, date, raw, amount, tag, extra = {}) =>
  entry(id, date, cleanLabel(raw), amount, { description: withTag(raw, tag), createdAt: `${date} 12:00:00`, ...extra })

describe('entryKind', () => {
  it('tells plan entries, bank rows, confirmed plans, own transfers and balance updates apart', () => {
    expect(entryKind(entry(1, '2026-09-01', 'Rent', -900))).toBe('plan')
    expect(entryKind(imported(2, '2026-09-01', 'ACHAT INTERAC - 1234 CORNER CAFE', -5, 'aaaaaaaaaa'))).toBe('bank')
    expect(entryKind(imported(3, '2026-09-01', 'PAIEMENT DIVERS HYDRO', -90, 'bbbbbbbbbb', { label: 'Hydro' }))).toBe('matched')
    expect(entryKind(imported(4, '2026-09-01', 'Â TROUVÉPARGNE', -50, 'cccccccccc'))).toBe('transfer')
    expect(entryKind(imported(5, '2026-09-01', 'VIREMENT PAR BANQUE EN DIRECT - 1111', -500, 'dddddddddd'))).toBe('transfer')
    expect(entryKind(entry(6, '2026-09-01', 'Balance Update', 50, { category: { id: 99, type: 'balance_update' } }))).toBe('balance')
  })
})

describe('rows imported while still pending', () => {
  // the last upload ended Sep 24 while two rows were pending; this one starts that same day, posted
  const rows = parseBankCsv(csv(
    '9/24/2026,,ACHAT INTERAC SANS CONTACT - 4321 SQ *GIFT SHOP,,-42.1,',
    '9/24/2026,,DÉPÔT DE PAIE PAIE/PAYROLL,,1500,',
    '9/24/2026,,ACHAT INTERAC,,-12.5,',
    '9/25/2026,,ACHAT INTERAC - 2222 CORNER CAFE,,-4.25,',
  )).rows
  const entries = [
    imported(1, '2026-09-24', 'ACHAT INTERAC', -42.1, '1111111111'),
    imported(2, '2026-09-24', 'DÉPÔT DE PAIE', 1500, '2222222222', { label: 'Pay' }),
    imported(3, '2026-09-24', 'ACHAT INTERAC SANS CONTACT - 3333 BOOK STORE', -12.5, '3333333333'),
  ]
  const plan = reconcile(rows, entries)

  it('updates them with their posted description instead of adding them again', () => {
    expect(plan.refreshed.map((r) => [r.entry.id, r.kind, r.row.raw])).toEqual([
      [1, 'bank', 'ACHAT INTERAC SANS CONTACT - 4321 SQ *GIFT SHOP'],
      [2, 'matched', 'DÉPÔT DE PAIE PAIE/PAYROLL'],
    ])
    expect(plan.added.map((r) => r.amount)).toEqual([-4.25])
  })

  it('skips a row this file still shows pending when its posted copy is in', () => {
    expect(plan.duplicates).toBe(1)
    expect(plan.unwritten).toEqual([rows.find((r) => r.amount === -12.5).fp])
  })

  it('finds the copies earlier uploads already wrote twice', () => {
    const twins = findTwins([
      imported(1, '2026-10-16', 'DÉPÔT DE PAIE', 1500, '1111111111'),
      imported(2, '2026-10-16', 'DÉPÔT DE PAIE PAIE/PAYROLL', 1500, '2222222222'),
      imported(3, '2026-10-16', 'TÉLÉVIREMENT AU COMPTE DE DÉPÔT', -500, '3333333333', { label: 'Cottage' }),
      imported(4, '2026-10-16', 'TÉLÉVIREMENT AU COMPTE DE DÉPÔT-9999', -500, '4444444444'),
      // the same text twice is two real transactions
      imported(5, '2026-10-01', 'Â TROUVÉPARGNE', -50, '5555555555'),
      imported(6, '2026-10-01', 'Â TROUVÉPARGNE', -50, '6666666666'),
    ])
    expect(twins).toEqual([
      expect.objectContaining({ keep: 2, drop: expect.objectContaining({ id: 1 }), dropTag: '1111111111' }),
      // the copy that confirmed a plan entry stays and takes the posted description
      expect.objectContaining({ keep: 3, drop: expect.objectContaining({ id: 4 }), description: expect.stringContaining('[hb:4444444444]') }),
    ])
  })
})

describe('balance updates', () => {
  const rows = parseBankCsv(csv('10/20/2026,,ACHAT INTERAC - 1234 CORNER CAFE,,-10,', '10/30/2026,,DÉPÔT DE PAIE,,1000,')).rows
  const anchorEntry = entry(50, '2026-10-16', 'Balance Update', -40, {
    createdAt: '2026-10-16 23:59:59', description: withTag('Bank balance from statement', 'balance'), category: { id: 99, type: 'balance_update' },
  })
  const entries = [anchorEntry, entry(51, '2026-10-10', 'Old', -99), entry(52, '2026-10-22', 'Rent', -300, { confirmed: false })]
  const plan = reconcile(rows, entries)

  it('counts from the last bank balance before the statement ends', () => {
    const anchors = [{ id: 50, date: '2026-10-16', balance: 2000 }]
    expect(balanceAfter(plan, entries, 5000, {}, anchors)).toBe(2990)
    // without one it counts the whole ledger from the start
    expect(balanceAfter(plan, entries, 5000)).toBe(5000 - 40 - 99 - 10 + 1000)
  })

  it('knows what the plan alone expected since then, until bank rows land', () => {
    const start = { date: '2026-10-16', balance: 2000 }
    expect(planSince(entries, start, '2026-10-30')).toBe(-300)
    expect(planSince([...entries, imported(53, '2026-10-20', 'X', -1, 'aaaaaaaaaa')], start, '2026-10-30')).toBe(null)
    expect(planSince(entries, null, '2026-10-30')).toBe(null)
  })
})

describe('recurringCandidates', () => {
  it('spots same-amount charges on a monthly or weekly rhythm, ignoring reference numbers', () => {
    const found = recurringCandidates([
      { date: '2026-09-18', amount: -450, label: 'VIREMENT EN LIGNE ENVOYÉ - 1234 JANE DOE' },
      { date: '2026-10-20', amount: -450, label: 'VIREMENT EN LIGNE ENVOYÉ - 5678 JANE DOE' },
      { date: '2026-10-05', amount: -25, label: 'GYM' },
      { date: '2026-10-12', amount: -25, label: 'GYM' },
      { date: '2026-10-19', amount: -25, label: 'GYM' },
      // two a week apart prove nothing; groceries vary
      { date: '2026-10-05', amount: -9, label: 'BAKERY' },
      { date: '2026-10-12', amount: -9, label: 'BAKERY' },
      { date: '2026-09-15', amount: -120, label: 'GROCER' },
      { date: '2026-10-15', amount: -260, label: 'GROCER' },
    ])
    expect(found.map((c) => [c.label, c.amount, c.every])).toEqual([
      ['VIREMENT EN LIGNE ENVOYÉ - 5678 JANE DOE', -450, 'month'],
      ['GYM', -25, 'week'],
    ])
  })
})

describe('reconcile', () => {
  const rows = parseBankCsv(csv(
    '9/10/2026,,PRÊT HYPOTHÉCAIRE ACME,,-410,',
    '9/15/2026,,PAIEMENT DIVERS UTILITY CO,,-312,',
    '9/17/2026,,ASSURANCE AUTO ACME,,-512.4,',
    '9/21/2026,,ACHAT INTERAC - 2143 LUMBER YARD,,-248.6,',
    '9/21/2026,,ACHAT INTERAC SANS CONTACT - 8013 SQ *BAKE SALE,,-14.6,',
    '9/22/2026,,PAIEMENT DIVERS PRET AUTO,,-260.5,',
    '9/22/2026,,PAIEMENT DIVERS PRET AUTO,,-150.25,',
    '9/24/2026,,ACHAT INTERAC,,-37.9,',
  )).rows
  const entries = [
    entry(1, '2026-09-11', 'Mortgage', -410, { recurring: true }),
    entry(2, '2026-09-17', 'Hydro', -312),
    entry(3, '2026-09-17', 'Car insurance', -512.38),
    entry(4, '2026-09-21', 'Groceries', -250),
    entry(5, '2026-09-20', 'Car loan', -410.75),
    entry(6, '2026-09-12', 'Carte credit', -1000),
    entry(7, '2026-09-23', 'Life insurance', -48.2),
    entry(8, '2026-09-25', 'Mortgage', -410, { recurring: true }),
    entry(9, '2026-09-15', 'Balance Update', 50, { category: { id: 99, type: 'balance_update' } }),
  ]
  const plan = reconcile(rows, entries)
  const matchedIds = plan.matched.map((m) => m.entry.id)

  it('lines planned bills up with the bank, a few days and cents apart', () => {
    expect(matchedIds).toEqual(expect.arrayContaining([1, 2, 3]))
  })

  it('matches a bill paid in two parts to the same payee, but not any two purchases', () => {
    expect(plan.matched.find((m) => m.entry.id === 5)?.rows.map((r) => r.amount)).toEqual([-260.5, -150.25])
    expect(matchedIds).not.toContain(4)
  })

  it('adds what matches nothing', () => {
    expect(plan.added.map((r) => r.amount)).toEqual([-248.6, -14.6, -37.9])
  })

  it('proposes removing stale plan entries and keeping recent ones pending', () => {
    expect(plan.missing.map((m) => [m.id, m.action])).toEqual([[6, 'remove'], [4, 'remove'], [7, 'pending']])
  })

  it('never touches balance updates or entries after the statement', () => {
    expect([...matchedIds, ...plan.missing.map((m) => m.id)]).not.toContain(9)
    expect([...matchedIds, ...plan.missing.map((m) => m.id)]).not.toContain(8)
  })

  it('skips rows a previous import already wrote', () => {
    const again = reconcile(rows, [...entries, entry(20, '2026-09-24', 'ACHAT INTERAC', -37.9, { description: withTag('x', rows[7].fp) })])
    expect(again.duplicates).toBe(1)
    expect(again.added.map((r) => r.amount)).toEqual([-248.6, -14.6])
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
    '9/23/2026,,DÉPÔT DE PAIE PAIE/PAYROLL,,1850,',
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

  it('keeps a bank row when confirming its plan entry fails, and says so', async () => {
    const mock = expensaveMockApi(() => today)
    const flaky = { ...mock, updateExpense: () => Promise.reject(new Error('HTTP 500')) }
    const app = express()
    app.use(express.json())
    app.use('/y', expensaveRouter(flaky, { stateFile: path.join(dir, 'flaky.json') }))
    const s = await new Promise((resolve) => { const srv = app.listen(0, () => resolve(srv)) })
    // the demo plans a $1485 mortgage on the 1st
    const file = csv('9/1/2026,,PRÊT HYPOTHÉCAIRE,,-1485,')
    const r = await fetch(`http://127.0.0.1:${s.address().port}/y/import/apply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: file, calendar: 1 }),
    }).then(async (res) => ({ status: res.status, body: await res.json() }))
    s.close()
    expect(r.status).toBe(207)
    expect(r.body.matched).toBe(0)
    expect(r.body.added).toBe(1)
    expect(r.body.lost).toBe(0)
  })

  it('reports rows that never made it into Expensave', async () => {
    const mock = expensaveMockApi(() => today)
    const lossy = { ...mock, createExpense: async () => ({ id: 1 }) }
    const app = express()
    app.use(express.json())
    app.use('/z', expensaveRouter(lossy, { stateFile: path.join(dir, 'lossy.json') }))
    const s = await new Promise((resolve) => { const srv = app.listen(0, () => resolve(srv)) })
    const r = await fetch(`http://127.0.0.1:${s.address().port}/z/import/apply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: statement, calendar: 1 }),
    }).then(async (res) => ({ status: res.status, body: await res.json() }))
    s.close()
    expect(r.status).toBe(207)
    expect(r.body.lost).toBe(3)
    expect(r.body.errors.some((e) => /not in Expensave: 2026-09-23 DÉPÔT DE PAIE/.test(e))).toBe(true)
  })

  it('keeps an earlier bank balance true when a later upload adds a row before it', async () => {
    const mock = expensaveMockApi(() => today)
    const app = express()
    app.use(express.json())
    app.use('/w', expensaveRouter(mock, { stateFile: path.join(dir, 'anchors.json') }))
    const s = await new Promise((resolve) => { const srv = app.listen(0, () => resolve(srv)) })
    const at = `http://127.0.0.1:${s.address().port}/w`
    const apply = (body) => fetch(`${at}/import/apply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calendar: 1, ...body }),
    }).then((res) => res.json())
    const balanceOn = async (day) => (await fetch(`${at}/expenses?calendars=1&start=2026-09-01&end=2026-09-30`).then((res) => res.json()))
      .days.find((d) => d.date === day).balance

    await apply({ csv: csv('9/20/2026,,ACHAT INTERAC - 1111 CORNER CAFE,,-5,', '9/22/2026,,ACHAT INTERAC - 2222 CORNER CAFE,,-6,'), balance: 3000 })
    expect(await balanceOn('2026-09-22')).toBe(3000)
    // a fresh export of the same days shows a deposit the first one lacked; no balance typed this time
    const second = await apply({ csv: csv('9/21/2026,,DÉPÔT DE PAIE PAIE/PAYROLL,,1500,', '9/22/2026,,ACHAT INTERAC - 2222 CORNER CAFE,,-6,') })
    expect(second.errors).toEqual([])
    expect(await balanceOn('2026-09-22')).toBe(3000)

    const preview = await fetch(`${at}/import/preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendar: 1, csv: csv('9/23/2026,,ACHAT INTERAC - 3333 CORNER CAFE,,-7,') }),
    }).then((res) => res.json())
    s.close()
    expect(preview.balanceFrom).toEqual({ date: '2026-09-22', balance: 3000 })
    expect(preview.balanceAfter).toBe(Math.round((3000 - 7 + preview.plannedSince) * 100) / 100)
  })

  it('counts what happened after the export on the last statement day', async () => {
    const mock = expensaveMockApi(() => today)
    const app = express()
    app.use(express.json())
    app.use('/v', expensaveRouter(mock, { stateFile: path.join(dir, 'late.json') }))
    const s = await new Promise((resolve) => { const srv = app.listen(0, () => resolve(srv)) })
    const at = `http://127.0.0.1:${s.address().port}/v`
    const call = (step, body) => fetch(`${at}/import/${step}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calendar: 1, ...body }),
    }).then((res) => res.json())

    // exported mid-day on the 22nd; the next file shows a purchase made that evening
    await call('apply', { csv: csv('9/21/2026,,ACHAT INTERAC - 1111 CORNER CAFE,,-5,', '9/22/2026,,ACHAT INTERAC - 2222 CORNER CAFE,,-6,'), balance: 3000 })
    const next = csv('9/22/2026,,ACHAT INTERAC - 2222 CORNER CAFE,,-6,', '9/22/2026,,ACHAT INTERAC - 4444 PUB,,-40,', '9/23/2026,,ACHAT INTERAC - 3333 CORNER CAFE,,-7,')
    const preview = await call('preview', { csv: next })
    const bank = Math.round((3000 - 40 - 7 + preview.plannedSince) * 100) / 100
    expect(preview.balanceAfter).toBe(bank)
    const applied = await call('apply', { csv: next, balance: bank })
    const ledger = await fetch(`${at}/expenses?calendars=1&start=2026-09-01&end=2026-09-30`).then((res) => res.json())
    s.close()
    expect(applied.errors).toEqual([])
    expect(ledger.days.find((d) => d.date === '2026-09-22').balance).toBe(2960)
  })

  it('records money moved to savings as a transfer for today', async () => {
    const before = await fetch(`${base}/x/expenses?calendars=1&start=2026-09-24&end=2026-09-24`).then((r) => r.json())
    const saved = await post('/x/set-aside', { calendar: 1, amount: 250, label: 'Savings', date: '2026-09-24' })
    expect(saved.status).toBe(200)
    const after = await fetch(`${base}/x/expenses?calendars=1&start=2026-09-24&end=2026-09-24`).then((r) => r.json())
    const row = after.transactions.find((t) => t.id === saved.body.id)
    expect(row).toMatchObject({ amount: -250, label: 'Savings', kind: 'plan', category: expect.objectContaining({ name: 'Savings' }) })
    expect(after.days[0].balance).toBe(Math.round((before.days[0].balance - 250) * 100) / 100)
    expect((await post('/x/set-aside', { calendar: 1, amount: -5, label: 'x', date: '2026-09-24' })).status).toBe(400)
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
