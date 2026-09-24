/**
 * Bank statement → Expensave reconciliation.
 *
 * Every two weeks the household downloads the last 14 days of the chequing
 * account as CSV (Desjardins: "Type de compte, Numéro du compte, Date de
 * l'opération, …, CAD$"). That file is the truth about what already happened;
 * Expensave mostly holds the PLAN (recurring bills, grocery budgets, expected
 * paycheques). Reconciling the two, for the dates the statement covers:
 *
 *   - a bank row that lines up with a planned entry (same sign, amount within a
 *     few cents, date within a few days) turns that entry into the real one: it
 *     keeps its nice label and category, takes the bank's date and amount
 *   - a bank row nothing lines up with is added as a new confirmed entry
 *   - a planned entry the bank never saw is either removed (it did not happen,
 *     or a budget line the real purchases now replace) or kept as "pending"
 *     (unconfirmed — still expected, so the set-aside math keeps reserving it)
 *   - rows already imported by a previous upload are skipped (fingerprint tag)
 *
 * Finally the account balance the bank shows is written as an Expensave
 * "balance update" at the end of the statement, so the running balance — the
 * starting point of "safe to set aside" — is the bank's, not a drifted estimate.
 *
 * Everything here is pure; server/expensave.js does the I/O.
 */

import { createHash } from 'node:crypto'

// ---------- CSV ----------
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

/**
 * Parse the day column. The export uses M/D/YYYY, but banks change their minds,
 * so the order is decided from the whole file: any first part above 12 means D/M.
 */
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

/**
 * A bank description, trimmed to what a person would call the transaction:
 * "ACHAT INTERAC SANS CONTACT - 2570 SQ *CENDRILLON" → "SQ *CENDRILLON".
 * Stable across statements, which is what lets Expensave's own label
 * suggestions carry a category chosen once to every later import.
 */
export function cleanLabel(desc) {
  const s = desc.replace(/\s+/g, ' ').trim()
  const purchase = s.match(/^ACHAT (?:INTERAC(?: SANS CONTACT)?|VISA D[ÉE]BIT|D[ÉE]BIT) - \d{3,5} (.+)$/i)
  if (purchase) return purchase[1].trim()
  // "VIREMENT PAR BANQUE EN DIRECT - 2866": the trailing number is a reference
  return s.replace(/ - \d{3,6}$/, '').trim() || s
}

/**
 * Bank CSV → { accounts, rows }. Rows carry the day, signed amount (spending
 * negative, like Expensave), the raw and cleaned description, the balance if the
 * export has one, and a fingerprint identical across overlapping statements.
 */
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

// ---------- categories ----------
/**
 * First-guess categories for new rows, by Expensave category name (English or
 * French; a category that does not exist is simply skipped). Expensave's own
 * label suggestions win over these, so fixing a category once in Expensave
 * sticks for every later import.
 */
export const CATEGORY_RULES = [
  [/PAIE|PAYROLL|ALLOCATION|SALAIRE/i, ['Income', 'Revenu', 'Salary']],
  [/MAXI|IGA|METRO|COSTCO|SUPER C|PROVIGO|WALMART|MARCHE|MARCHÉ|BOUCHERIE|FRUITERIE/i, ['Groceries', 'Épicerie']],
  [/TIM HORTONS|STARBUCKS|MCDONALD|RESTAURANT|PIZZ|SUSHI|CAFE|CAFÉ|PATISSERIE|PÂTISSERIE|BOULANG|SUBWAY|A&W|UBER EATS|DOORDASH/i, ['Eating out', 'Restaurants']],
  [/PHARMA|PHARMACIE|DENTAI|CLINIQUE|NEWLOOK|OPTOM|MANULIFE|SANTÉ/i, ['Health', 'Santé']],
  [/HYUNDAI|SAAQ|COUCHE-?TARD|ULTRAMAR|SHELL|ESSO|PETRO|IRVING|CANADIAN TIRE|STATIONNEMENT|PARKING/i, ['Car & Transportation', 'Auto', 'Transport']],
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

// ---------- reconciliation ----------
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
// "La personnelle" is planned at 535.29 and billed at 535.30: a few cents or
// half a percent is the same bill; 280 vs 281.67 is not.
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

/**
 * Work out what an upload would change. `entries` are the calendar's raw
 * Expensave rows around the statement ([from − PENDING_DAYS, to + PENDING_DAYS]
 * is plenty). Returns every decision with its reason; nothing is written.
 */
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

  // one planned bill paid in two parts to the same payee ("Moto" −399.71 =
  // FED.CAISSES −254.33 + FED.CAISSES −145.38). Any two purchases would do far
  // too often — a −280 grocery budget is always the sum of *something*.
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

/**
 * Expensave's confirmed balance at the end of `to` once `plan` is applied with
 * the given per-entry decisions. `base` is the balance before the first day in
 * `entries`' range; entries must cover that range up to `to`.
 */
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
