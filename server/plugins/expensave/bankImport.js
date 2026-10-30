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
  // whole word: "PAIEMENT DIVERS" is a charge, not a paycheque
  [/\bPAIE\b|PAYROLL|ALLOCATION|SALAIRE/i, ['Income', 'Revenu', 'Salary']],
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
  const rule = CATEGORY_RULES.find(([re, names]) => re.test(row.raw) && categoryNamed(categories, names))
  return rule ? categoryNamed(categories, rule[1]) : null
}

/** Id of the first existing category with one of `names` (any case), or null. */
export function categoryNamed(categories, names) {
  const byName = new Map(categories.filter((c) => c.type !== 'balance_update').map((c) => [c.name.toLowerCase(), c.id]))
  return names.map((n) => byName.get(n.toLowerCase())).find((id) => id != null) ?? null
}

/** Tag HomeBoard leaves in an Expensave description to recognise its own rows. */
export const TAG_RE = /\[hb:([0-9a-f]{10}|balance)\]/
export const tagOf = (e) => (e.description ?? '').match(TAG_RE)?.[1] ?? null
export const withTag = (text, tag) => `${text ? `${text} ` : ''}[hb:${tag}]`
/** The bank's description of an imported row, without the tag. */
export const rawOf = (e) => (e.description ?? '').replace(TAG_RE, '').trim()

/** How far a bank date may sit from the planned one and still be the same bill. */
export const MATCH_DAYS = 4
/** Unconfirmed ("still coming") entries are late by definition — look further. */
export const PENDING_DAYS = 14
/** Planned entries this close to the statement's end may simply not have landed yet. */
export const GRACE_DAYS = 2

const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000)
const round2 = (v) => Math.round(v * 100) / 100
const sameCents = (a, b) => Math.round(a * 100) === Math.round(b * 100)
// a few cents or half a percent apart is the same bill; 280 vs 281.67 is not
const close = (a, b) => Math.sign(a) === Math.sign(b) && Math.abs(a - b) <= Math.max(0.05, Math.abs(a) * 0.005)
const isBalanceUpdate = (e) => e.category?.type === 'balance_update'
const isImported = (e) => !!tagOf(e) && tagOf(e) !== 'balance'
export const dayOf = (e) => String(e.createdAt ?? '').slice(0, 10)

/** Money moved between the household's own accounts: saving, not spending. */
const OWN_TRANSFER_RE = /TROUV[ÉE]PARGNE|T[ÉE]L[ÉE]VIREMENT AU COMPTE|VIREMENT PAR BANQUE EN DIRECT|VIREMENT ENTRE (?:COMPTES|FOLIOS)|TRANSFER (?:TO|FROM|BETWEEN) (?:YOUR |MY )?(?:ACCOUNTS?|SAVINGS|CHEQUING)/i
export const isOwnTransfer = (raw) => OWN_TRANSFER_RE.test(raw)

/**
 * What an entry is to HomeBoard: `plan` (typed in Expensave), `matched` (a bank row that confirmed a plan entry),
 * `bank` (a bank row nothing planned), `transfer` (between the household's own accounts) or `balance`.
 */
export function entryKind(e) {
  if (isBalanceUpdate(e) || tagOf(e) === 'balance') return 'balance'
  if (!isImported(e)) return 'plan'
  const raw = rawOf(e)
  // a new row is named after the bank's description; a confirmed plan entry keeps its own name
  if ((e.label ?? '') !== (cleanLabel(raw) || raw || '—')) return 'matched'
  return isOwnTransfer(raw) ? 'transfer' : 'bank'
}

const squash = (s) => s.replace(/\s+/g, ' ').trim().toUpperCase()
/** True when `early` is how the bank showed a transaction before it posted ("DÉPÔT DE PAIE") and `late` its final text. */
const isEarlyForm = (early, late) => {
  const a = squash(early)
  const b = squash(late)
  return a.length > 0 && a.length < b.length && b.startsWith(a)
}
const sameTransaction = (e, day, amount) => dayOf(e) === day && sameCents(e.amount, amount)

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
 * Rows earlier uploads wrote twice: once while pending, once posted. The posted one stays, unless the pending one
 * confirmed a plan entry: then that one keeps its name and takes the posted description (and fingerprint).
 */
export function findTwins(entries) {
  const imported = entries.filter(isImported)
  const used = new Set()
  const twins = []
  for (const early of imported) {
    if (used.has(early)) continue
    const late = imported.find((e) => e !== early && !used.has(e) &&
      sameTransaction(e, dayOf(early), early.amount) && isEarlyForm(rawOf(early), rawOf(e)))
    if (!late) continue
    used.add(early)
    used.add(late)
    const keepEarly = entryKind(early) === 'matched'
    const [keep, drop] = keepEarly ? [early, late] : [late, early]
    twins.push({ keep: keep.id, drop: planView(drop), dropTag: tagOf(drop), ...(keepEarly ? { description: late.description } : {}) })
  }
  return twins
}

/** What an upload would change, given the calendar's raw entries around the statement. */
export function reconcile(rows, entries) {
  const from = rows[0].date
  const to = rows[rows.length - 1].date
  const imported = entries.filter(isImported)
  const importedTags = new Set(imported.map(tagOf))
  const statementTags = new Set(rows.map((r) => r.fp))
  const twins = findTwins(entries)
  const twinIds = new Set(twins.flatMap((t) => [t.keep, t.drop.id]))

  // a row imported while pending comes back with its posted description: it is updated, never added twice
  const earlier = imported.filter((e) => !statementTags.has(tagOf(e)) && !twinIds.has(e.id))
  const claimed = new Set()
  const fresh = []
  const refreshed = []
  const stillPending = []
  let duplicates = 0
  for (const r of rows) {
    if (importedTags.has(r.fp)) {
      duplicates++
      continue
    }
    const e = earlier.find((x) => !claimed.has(x) && sameTransaction(x, r.date, r.amount) &&
      (isEarlyForm(rawOf(x), r.raw) || isEarlyForm(r.raw, rawOf(x))))
    if (!e) {
      fresh.push(r)
      continue
    }
    claimed.add(e)
    if (isEarlyForm(rawOf(e), r.raw)) refreshed.push({ entry: planView(e), kind: entryKind(e), row: r })
    else {
      // this file still shows it pending; the posted row is already in
      stillPending.push(r)
      duplicates++
    }
  }

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

  return {
    from,
    to,
    count: rows.length,
    rows,
    matched,
    added,
    refreshed,
    twins,
    duplicates,
    // statement rows whose own fingerprint won't be in Expensave: their posted twin is
    unwritten: [...stillPending.map((r) => r.fp), ...twins.filter((t) => !t.description).map((t) => t.dropTag)],
    missing,
    // the export's own running balance, when it has one, is the anchor
    bankBalance: [...rows].reverse().find((r) => r.balance != null)?.balance ?? null,
  }
}

/** The newest balance update before `day`: from there on the ledger has to add up by itself. */
export const latestAnchor = (anchors, day) =>
  anchors.filter((a) => a.date < day).sort((a, b) => a.date.localeCompare(b.date)).pop() ?? null

/**
 * What this upload adds to `day` beyond its earlier balance update. That update holds the balance when the last
 * file was exported, often mid-day: bank rows new on that day happened after, and replace what was planned there.
 */
export function landedOn(plan, day) {
  const rows = [...plan.matched.flatMap((m) => m.rows), ...plan.added].filter((r) => r.date === day)
  const replaced = plan.matched.filter((m) => m.entry.confirmed && m.entry.date === day)
  return round2(rows.reduce((s, r) => s + r.amount, 0) - replaced.reduce((s, m) => s + m.entry.amount, 0))
}

/**
 * Confirmed balance at the end of the statement once `plan` is applied. It counts from the newest balance update
 * before the statement's last day (`anchors` hold absolute end-of-day balances), else from `base`, the balance
 * before the first entry.
 */
export function balanceAfter(plan, entries, base, decisions = {}, anchors = []) {
  const start = latestAnchor(anchors, plan.to)
  const counts = (day) => day <= plan.to && (!start || day > start.date)
  const skipped = new Set([...plan.twins.map((t) => t.drop.id), ...plan.matched.map((m) => m.entry.id), ...anchors.map((a) => a.id)])
  for (const m of plan.missing) {
    const action = decisions[m.id] ?? m.action
    if (action === 'remove' || action === 'pending') skipped.add(m.id)
  }
  let total = start ? start.balance + landedOn(plan, start.date) : base
  for (const e of entries) {
    if (e.confirmed !== false && !skipped.has(e.id) && counts(dayOf(e))) total += e.amount
  }
  for (const r of [...plan.matched.flatMap((m) => m.rows), ...plan.added]) if (counts(r.date)) total += r.amount
  return round2(total)
}

/** What the plan alone expected between `start` (a balance update) and `to`; null once bank rows are in that span. */
export function planSince(entries, start, to) {
  if (!start) return null
  const span = entries.filter((e) => dayOf(e) > start.date && dayOf(e) <= to)
  if (span.some(isImported)) return null
  return round2(span.filter((e) => entryKind(e) === 'plan').reduce((total, e) => total + e.amount, 0))
}

/** Rhythms a repeating charge can follow: name, days apart, slack in days. */
const RHYTHMS = [['week', 7, 2], ['twoWeeks', 14, 3], ['month', 30.4, 4]]
// "VIREMENT EN LIGNE ENVOYÉ - 1234 JANE DOE" and "… - 5678 JANE DOE" are the same payee
const payeeKey = (label) => squash(label.replace(/\d{3,}/g, ' ').replace(/[-*#]/g, ' '))

/**
 * Charges that come back on a rhythm at the same amount: worth adding to the plan so they are reserved on their day.
 * `rows` are `{ date, amount, label }` the plan didn't announce.
 */
export function recurringCandidates(rows) {
  const groups = new Map()
  for (const r of rows) {
    if (r.amount >= 0) continue
    const key = payeeKey(r.label)
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const found = []
  for (const list of groups.values()) {
    if (list.length < 2) continue
    list.sort((a, b) => a.date.localeCompare(b.date))
    const amounts = list.map((r) => r.amount).sort((a, b) => a - b)
    const typical = amounts[Math.floor(amounts.length / 2)]
    if (!amounts.every((a) => Math.abs(a - typical) <= Math.max(1, Math.abs(typical) * 0.05))) continue
    const gaps = list.slice(1).map((r, i) => dayNum(r.date) - dayNum(list[i].date))
    const rhythm = RHYTHMS.find(([, days, slack]) => gaps.every((g) => Math.abs(g - days) <= slack))
    // two charges a week apart prove little; two a month apart are worth a look
    if (!rhythm || (rhythm[0] !== 'month' && list.length < 3)) continue
    const last = list[list.length - 1]
    found.push({ label: last.label, amount: round2(typical), every: rhythm[0], last: last.date, count: list.length })
  }
  return found.sort((a, b) => a.amount - b.amount)
}
