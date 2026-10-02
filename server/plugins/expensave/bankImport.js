// Bank statement → Expensave reconciliation, without I/O (see importRouter.js). A bank row matching a planned
// entry confirms it, an unmatched row is added, a planned entry the bank never saw is removed or kept pending.

import { createHash } from 'node:crypto'

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9$]/g, '')

/** Column index whose normalised header matches one of the candidates. */
const col = (headers, ...names) => {
  const h = headers.map(norm)
  for (const n of names) {
    const i = h.indexOf(norm(n))
    if (i >= 0) return i
  }
  return -1
}

const money = (s) => {
  if (s == null) return null
  const t = String(s).replace(/[\s$\u00a0]/g, '')
  if (!t) return null
  // "1 234,56" (fr) and "1,234.56" (en) both occur in the wild
  const v = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''))
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null
}

/** Day parser for the whole column: any first part above 12 means the file is D/M/YYYY. */
function dateParser(values) {
  const parts = values.map((v) => v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)).filter(Boolean)
  const dayFirst = parts.some((m) => Number(m[1]) > 12) && !parts.some((m) => Number(m[2]) > 12)
  const pad = (n) => String(n).padStart(2, '0')
  return (v) => {
    const s = v.trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
    if (!m) return null
    const [mo, d] = dayFirst ? [m[2], m[1]] : [m[1], m[2]]
    if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null
    return `${m[3]}-${pad(mo)}-${pad(d)}`
  }
}

/** The merchant part of a bank description, stable across statements: "ACHAT INTERAC - 2570 SQ *CORNER BAKERY" → "SQ *CORNER BAKERY". */
export function cleanLabel(desc) {
  const s = desc.replace(/\s+/g, ' ').trim()
  const purchase = s.match(/^ACHAT (?:INTERAC(?: SANS CONTACT)?|VISA D[ÉE]BIT|D[ÉE]BIT) - \d{3,5} (.+)$/i)
  if (purchase) return purchase[1].trim()
  // "VIREMENT PAR BANQUE EN DIRECT - 2866": the trailing number is a reference
  return s.replace(/ - \d{3,6}$/, '').trim() || s
}

/** Bank CSV → `{ accounts, rows }`; each row's fingerprint is identical across overlapping statements. */
export function parseBankCsv(text) {
  const table = parseCsv(text)
  if (table.length < 2) throw new Error('The file has no transactions')
  const headers = table[0]
  const iDate = col(headers, "Date de l'opération", 'Date de transaction', 'Date', 'Transaction date', 'Posted date')
  const iD1 = col(headers, 'Description 1', 'Description', 'Libellé')
  const iD2 = col(headers, 'Description 2')
  const iAmt = col(headers, 'CAD$', 'Montant', 'Amount', 'Montant CAD$')
  const iOut = col(headers, 'Retrait', 'Débit', 'Withdrawal', 'Withdrawals', 'Debit')
  const iIn = col(headers, 'Dépôt', 'Crédit', 'Deposit', 'Deposits', 'Credit')
  const iBal = col(headers, 'Solde', 'Balance', 'Solde CAD$')
  const iType = col(headers, 'Type de compte', 'Account type')
  const iAcct = col(headers, 'Numéro du compte', 'Account number', 'Compte')
  if (iDate < 0 || iD1 < 0 || (iAmt < 0 && iOut < 0 && iIn < 0)) {
    throw new Error('Unrecognised CSV — expected a date, a description and an amount column')
  }

  const body = table.slice(1)
  const toDay = dateParser(body.map((r) => r[iDate] ?? ''))
  const seen = new Map()
  const rows = []
  for (const r of body) {
    const date = toDay(r[iDate] ?? '')
    let amount = iAmt >= 0 ? money(r[iAmt]) : null
    if (amount == null && (iOut >= 0 || iIn >= 0)) {
      const out = money(r[iOut]) ?? 0
      const inn = money(r[iIn]) ?? 0
      amount = Math.round((inn - Math.abs(out)) * 100) / 100
    }
    if (!date || amount == null || amount === 0) continue
    const raw = [r[iD1], iD2 >= 0 ? r[iD2] : ''].map((s) => (s ?? '').trim()).filter(Boolean).join(' ')
    const account = [iType >= 0 ? r[iType] : '', iAcct >= 0 ? r[iAcct] : ''].map((s) => (s ?? '').trim()).filter(Boolean).join(' ')
    // identical rows on the same day (two coffees) stay distinct and stable
    const key = `${account}|${date}|${amount.toFixed(2)}|${raw}`
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    rows.push({
      date,
      amount,
      raw,
      label: cleanLabel(raw) || raw || '—',
      account,
      balance: iBal >= 0 ? money(r[iBal]) : null,
      fp: createHash('sha1').update(`${key}|${n}`).digest('hex').slice(0, 10),
    })
  }
  if (!rows.length) throw new Error('The file has no transactions')
  rows.sort((a, b) => a.date.localeCompare(b.date))
  const accounts = [...new Set(rows.map((r) => r.account))]
  return { accounts, rows }
}

/** Keyword guesses by Expensave category name, used when Expensave has no suggestion for a label. */
export const CATEGORY_RULES = [
  [/PAIE|PAYROLL|ALLOCATION|SALAIRE/i, ['Income', 'Revenu', 'Salary']],
  [/MAXI|IGA|METRO|COSTCO|SUPER C|PROVIGO|WALMART|MARCHE|MARCHÉ|BOUCHERIE|FRUITERIE/i, ['Groceries', 'Épicerie']],
  [/TIM HORTONS|STARBUCKS|MCDONALD|RESTAURANT|PIZZ|SUSHI|CAFE|CAFÉ|PATISSERIE|PÂTISSERIE|BOULANG|SUBWAY|A&W|UBER EATS|DOORDASH/i, ['Eating out', 'Restaurants']],
  [/PHARMA|PHARMACIE|DENTAI|CLINIQUE|NEWLOOK|OPTOM|MANULIFE|SANTÉ/i, ['Health', 'Santé']],
  [/SAAQ|COUCHE-?TARD|ULTRAMAR|SHELL|ESSO|PETRO|IRVING|CANADIAN TIRE|STATIONNEMENT|PARKING/i, ['Car & Transportation', 'Auto', 'Transport']],
  [/FRIPERIE|CHAUSSURE|SHOES|AUBAINERIE|VESTIM|WINNERS|SIMONS|OLD NAVY|H&M/i, ['Clothing', 'Vêtements']],
  [/APPLE\.C|NETFLIX|SPOTIFY|DISNEY|COGECO|VIDEOTRON|BELL|FIZZ|AMAZON PRIME/i, ['Subscriptions', 'Abonnements']],
  [/VIREMENT|TRANSFER|TROUV[ÉE]PARGNE|RETRAIT GAB/i, ['Transfer', 'Transfert']],
  [/DOLLARAMA|BUREAU EN GROS|RESERVE DE BOIS|RONA|HOME DEPOT|CANAC|IKEA/i, ['Household', 'Maison']],
  [/LIBRAIRIE|ARCHAMBA|LOISIRS|DESERRES|CINEMA|CINÉMA/i, ['Entertainment', 'Loisirs']],
]

/** Category id for a bank row from the keyword rules, or null. */
export function guessCategory(row, categories) {
  const byName = new Map(categories.filter((c) => c.type !== 'balance_update').map((c) => [c.name.toLowerCase(), c.id]))
  for (const [re, names] of CATEGORY_RULES) {
    if (!re.test(row.raw)) continue
    for (const n of names) if (byName.has(n.toLowerCase())) return byName.get(n.toLowerCase())
  }
  return null
}

/** Tag HomeBoard leaves in an Expensave description to recognise its own rows. */
export const TAG_RE = /\[hb:([0-9a-f]{10}|balance)\]/
export const tagOf = (e) => (e.description ?? '').match(TAG_RE)?.[1] ?? null
export const withTag = (text, tag) => `${text ? `${text} ` : ''}[hb:${tag}]`

/** How far a bank date may sit from the planned one and still be the same bill. */
export const MATCH_DAYS = 4
/** Unconfirmed ("still coming") entries are late by definition — look further. */
export const PENDING_DAYS = 14
/** Planned entries this close to the statement's end may simply not have landed yet. */
export const GRACE_DAYS = 2

const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000)
const round2 = (v) => Math.round(v * 100) / 100
// a few cents or half a percent apart is the same bill; 280 vs 281.67 is not
const close = (a, b) => Math.sign(a) === Math.sign(b) && Math.abs(a - b) <= Math.max(0.05, Math.abs(a) * 0.005)
const isBalanceUpdate = (e) => e.category?.type === 'balance_update'
const dayOf = (e) => String(e.createdAt ?? '').slice(0, 10)

const planView = (e) => ({
  id: e.id,
  date: dayOf(e),
  label: e.label ?? '',
  amount: e.amount,
  confirmed: e.confirmed !== false,
  recurring: !!e.recurring,
  category: e.category?.name ?? null,
})

/** What an upload would change, given the calendar's raw entries around the statement. */
export function reconcile(rows, entries) {
  const from = rows[0].date
  const to = rows[rows.length - 1].date
  const importedTags = new Set(entries.map(tagOf).filter((t) => t && t !== 'balance'))

  const duplicates = rows.filter((r) => importedTags.has(r.fp))
  const fresh = rows.filter((r) => !importedTags.has(r.fp))

  // entries that are still a plan: not ours, not Expensave's balance anchors
  const planned = entries.filter((e) => !tagOf(e) && !isBalanceUpdate(e) && dayOf(e))

  const window = (e) => (e.confirmed === false ? [-MATCH_DAYS, PENDING_DAYS] : [-MATCH_DAYS, MATCH_DAYS])
  const pairs = []
  for (const r of fresh) {
    for (const e of planned) {
      const diff = dayNum(r.date) - dayNum(dayOf(e))
      const [lo, hi] = window(e)
      if (diff < lo || diff > hi || !close(e.amount, r.amount)) continue
      // nearest date first, then nearest amount
      pairs.push({ r, e, score: Math.abs(diff) + Math.abs(e.amount - r.amount) })
    }
  }
  pairs.sort((a, b) => a.score - b.score)

  const usedRows = new Set()
  const usedEntries = new Set()
  const matched = []
  for (const p of pairs) {
    if (usedRows.has(p.r) || usedEntries.has(p.e)) continue
    usedRows.add(p.r)
    usedEntries.add(p.e)
    matched.push({ entry: planView(p.e), rows: [p.r] })
  }

  // a bill paid in two parts to the same payee; any two purchases would match far too often
  for (const e of planned) {
    if (usedEntries.has(e)) continue
    const [lo, hi] = window(e)
    const near = fresh.filter((r) => {
      const diff = dayNum(r.date) - dayNum(dayOf(e))
      return !usedRows.has(r) && diff >= lo && diff <= hi && Math.sign(r.amount) === Math.sign(e.amount)
    })
    let best = null
    for (let i = 0; i < near.length; i++) {
      for (let j = i + 1; j < near.length; j++) {
        const a = near[i]
        const b = near[j]
        if (a.date !== b.date || a.label !== b.label || !close(e.amount, round2(a.amount + b.amount))) continue
        const score = Math.abs(dayNum(a.date) - dayNum(dayOf(e)))
        if (!best || score < best.score) best = { a, b, score }
      }
    }
    if (best) {
      usedRows.add(best.a)
      usedRows.add(best.b)
      usedEntries.add(e)
      matched.push({ entry: planView(e), rows: [best.a, best.b] })
    }
  }
  matched.sort((a, b) => a.rows[0].date.localeCompare(b.rows[0].date))

  const added = fresh.filter((r) => !usedRows.has(r))

  // plan entries inside the statement's dates that the bank never saw
  const graceFrom = dayNum(to) - GRACE_DAYS
  const missing = planned
    .filter((e) => !usedEntries.has(e) && dayOf(e) >= from && dayOf(e) <= to)
    .map((e) => {
      const view = planView(e)
      const late = !view.confirmed || dayNum(view.date) >= graceFrom
      return { ...view, action: late ? 'pending' : 'remove' }
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  // earlier HomeBoard anchors inside the window get superseded by the new one
  const staleAnchors = entries
    .filter((e) => tagOf(e) === 'balance' && dayOf(e) >= from && dayOf(e) <= to)
    .map((e) => e.id)

  return {
    from,
    to,
    count: rows.length,
    matched,
    added,
    duplicates: duplicates.length,
    missing,
    staleAnchors,
    // the export's own running balance, when it has one, is the anchor
    bankBalance: [...rows].reverse().find((r) => r.balance != null)?.balance ?? null,
  }
}

/** Confirmed balance at the end of the statement once `plan` is applied; `base` precedes the first entry. */
export function balanceAfter(plan, entries, base, decisions = {}) {
  const removed = new Set(plan.staleAnchors)
  for (const m of plan.missing) {
    const action = decisions[m.id] ?? m.action
    if (action === 'remove' || action === 'pending') removed.add(m.id)
  }
  const matchedIds = new Set(plan.matched.map((m) => m.entry.id))
  let total = base
  for (const e of entries) {
    if (e.confirmed === false || removed.has(e.id) || matchedIds.has(e.id)) continue
    if (dayOf(e) <= plan.to) total += e.amount
  }
  for (const m of plan.matched) for (const r of m.rows) total += r.amount
  for (const r of plan.added) total += r.amount
  return round2(total)
}
