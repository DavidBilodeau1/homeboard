import fs from 'node:fs'
import express from 'express'
import {
  balanceAfter, dayOf, entryKind, guessCategory, isOwnTransfer, landedOn, latestAnchor, parseBankCsv, planSince, reconcile,
  recurringCandidates, tagOf, withTag, PENDING_DAYS,
} from './bankImport.js'

const DAY = 86_400_000
const WRITE_CONCURRENCY = 4
const SUGGEST_CONCURRENCY = 5
/** How far back the review looks for repeating charges and for rows earlier uploads wrote twice. */
const HISTORY_DAYS = 120

const shift = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const round2 = (v) => Math.round(v * 100) / 100
// noon keeps an imported row on its day whatever DST does
const noon = (day) => `${day} 12:00:00`

/** Runs `fn` over `items` with at most `n` in flight. */
async function pool(items, n, fn) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) await fn(items[next++])
  }))
}

const readState = (file) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

const writeState = (file, state) => {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n')
  fs.renameSync(tmp, file)
}

class BadRequest extends Error {
  constructor(message, extra = {}) {
    super(message)
    this.extra = extra
  }
}

function parseStatement(body) {
  if (typeof body?.csv !== 'string' || !body.csv.trim()) throw new BadRequest('csv is required')
  let parsed
  try {
    parsed = parseBankCsv(body.csv)
  } catch (e) {
    throw new BadRequest(e.message)
  }
  const { accounts } = parsed
  const account = body.account ?? (accounts.length === 1 ? accounts[0] : null)
  if (!account || !accounts.includes(account)) {
    throw new BadRequest('The file has several accounts — pick one', { accounts })
  }
  return { account, accounts, rows: parsed.rows.filter((r) => r.account === account) }
}

/** Category for a new row: Expensave's memory of its label first, then the keyword rules. */
async function createCategorizer(api, labels) {
  const categories = await api.categories().catch(() => [])
  const remembered = new Map()
  await pool(labels, SUGGEST_CONCURRENCY, async (label) => {
    const hit = await api.suggest(label).catch(() => null)
    const sameLabel = hit?.label?.toLowerCase() === label.toLowerCase()
    if (hit?.category && hit.category.type !== 'balance_update' && sameLabel) remembered.set(label, hit.category.id)
  })
  const byId = new Map(categories.map((c) => [c.id, c]))
  return {
    categoryFor: (row) => remembered.get(row.label) ?? guessCategory(row, categories),
    categoryName: (id) => byId.get(id)?.name ?? null,
  }
}

/** HomeBoard's balance updates, each with the bank balance it set: the ledger's balance at the end of its day. */
function anchorsOf(entries, days) {
  const endOfDay = new Map(days.map((d) => [String(d.balanceAt).slice(0, 10), round2(Number(d.balance))]))
  return entries
    .filter((e) => tagOf(e) === 'balance' && endOfDay.has(dayOf(e)))
    .map((e) => ({ id: e.id, date: dayOf(e), at: e.createdAt, description: e.description, balance: endOfDay.get(dayOf(e)) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Parses the statement, fetches the ledger around it and reconciles. Read-only. */
async function prepare(api, body) {
  const { account, accounts, rows } = parseStatement(body)
  const calendars = await api.calendars()
  const calendar = calendars.find((c) => c.id === Number(body.calendar)) ?? calendars[0]
  if (!calendar) throw new BadRequest('No Expensave calendar to import into')

  const from = rows[0].date
  const to = rows[rows.length - 1].date
  const start = [shift(from, -PENDING_DAYS), shift(to, -HISTORY_DAYS)].sort()[0]
  const payload = await api.expenses(calendar.id, start, shift(to, PENDING_DAYS))
  const entries = payload.expenses ?? []
  const days = payload.expenseBalances ?? []
  const base = days[0] ? round2(Number(days[0].balance) - Number(days[0].change)) : 0
  const plan = reconcile(rows, entries)
  const anchors = anchorsOf(entries, days)
  const since = latestAnchor(anchors, to)
  const lastDay = [...days].reverse().find((d) => String(d.balanceAt).slice(0, 10) <= to)
  const relabelled = plan.refreshed.filter((r) => r.kind !== 'matched').map((r) => r.row)
  const newRows = [...plan.added, ...plan.matched.flatMap((m) => m.rows.slice(1)), ...relabelled]
  const unplanned = [
    ...entries.filter((e) => entryKind(e) === 'bank').map((e) => ({ date: dayOf(e), amount: e.amount, label: e.label ?? '' })),
    ...plan.added.filter((r) => !isOwnTransfer(r.raw)),
  ]

  return {
    calendar,
    account,
    accounts,
    plan,
    entries,
    anchors,
    ...(await createCategorizer(api, [...new Set(newRows.map((r) => r.label))])),
    expensaveBalance: lastDay ? round2(Number(lastDay.balance)) : base,
    balanceAfter: balanceAfter(plan, entries, base, {}, anchors),
    balanceFrom: since && { date: since.date, balance: since.balance },
    plannedSince: planSince(entries, since, to),
    recurring: recurringCandidates(unplanned),
  }
}

const pickRow = (r) => ({ date: r.date, amount: r.amount, label: r.label, raw: r.raw })

/** Days between the previous statement and this one that no upload covered. */
const uncoveredDays = (last, account, from) =>
  last?.to && last.account === account
    ? Math.max(0, Math.round((Date.parse(from) - Date.parse(last.to)) / DAY) - 1)
    : 0

const previewOf = (p, last, canWrite) => ({
  from: p.plan.from,
  to: p.plan.to,
  count: p.plan.count,
  account: p.account,
  accounts: p.accounts,
  calendar: { id: p.calendar.id, name: p.calendar.name },
  matched: p.plan.matched.map((m) => ({ entry: m.entry, rows: m.rows.map(pickRow) })),
  added: p.plan.added.map((r) => ({ ...pickRow(r), category: p.categoryName(p.categoryFor(r)) })),
  refreshed: p.plan.refreshed.map(({ entry, row }) => ({ entry, row: pickRow(row) })),
  twins: p.plan.twins.map((t) => t.drop),
  duplicates: p.plan.duplicates,
  missing: p.plan.missing,
  recurring: p.recurring,
  bankBalance: p.plan.bankBalance,
  expensaveBalance: p.expensaveBalance,
  balanceAfter: p.balanceAfter,
  balanceFrom: p.balanceFrom,
  plannedSince: p.plannedSince,
  gapDays: uncoveredDays(last, p.account, p.plan.from),
  lastImport: last,
  canWrite,
})

/** Writes a prepared plan to Expensave, collecting failures instead of stopping at the first. */
function createWriter(api, { calendar, entries, categoryFor }) {
  const original = new Map(entries.map((e) => [e.id, e]))
  const errors = []
  const done = { matched: 0, added: 0, refreshed: 0, merged: 0, removed: 0, pending: 0, balance: null }

  const attempt = async (what, fn) => {
    try {
      await fn()
      return true
    } catch (e) {
      errors.push(`${what}: ${e.message}`)
      return false
    }
  }

  const newRow = (r, label = r.label, categoryId = categoryFor(r)) => ({
    calendar: { id: calendar.id },
    ...(categoryId ? { category: { id: categoryId } } : {}),
    label,
    amount: r.amount,
    createdAt: noon(r.date),
    confirmed: true,
    description: withTag(r.raw, r.fp),
  })

  // PUT wants the whole entry back, so start from what Expensave sent
  const edited = (e, patch) => ({
    calendar: { id: calendar.id },
    ...(e.category?.id ? { category: { id: e.category.id } } : {}),
    label: e.label,
    amount: e.amount,
    createdAt: e.createdAt,
    confirmed: e.confirmed !== false,
    description: e.description ?? null,
    recurring: false,
    ...patch,
  })

  const add = async (row) => {
    if (await attempt(`add “${row.label}”`, () => api.createExpense(newRow(row)))) done.added++
  }

  /** The planned entry becomes the real one: its label and category, the bank's date and amount. */
  const confirm = async ({ entry, rows: [first, ...rest] }) => {
    const e = original.get(entry.id)
    const ok = await attempt(`update “${e.label}”`, () => api.updateExpense(e.id, edited(e, {
      amount: first.amount,
      createdAt: noon(first.date),
      confirmed: true,
      description: withTag(first.raw, first.fp),
    })))
    if (ok) done.matched++
    // the bank row lands either way; the plan entry then just stays planned
    else await add(first)
    for (const r of rest) await attempt(`add “${r.label}”`, () => api.createExpense(newRow(r, e.label, e.category?.id)))
  }

  /** A row imported while pending takes its posted description; a bank row also its name and a category. */
  const refresh = async ({ entry, kind, row }) => {
    const e = original.get(entry.id)
    const categoryId = !e.category?.id || e.category.type === 'uncategorized' ? categoryFor(row) : null
    const patch = kind === 'matched' ? {} : { label: row.label, ...(categoryId ? { category: { id: categoryId } } : {}) }
    const ok = await attempt(`update “${e.label}”`, () => api.updateExpense(e.id, edited(e, { ...patch, description: withTag(row.raw, row.fp) })))
    if (ok) done.refreshed++
  }

  /** Drops the copy an earlier upload wrote twice. */
  const merge = async (twin) => {
    if (!(await attempt(`remove duplicate “${twin.drop.label}”`, () => api.deleteExpense(twin.drop.id)))) return
    done.merged++
    if (!twin.description) return
    const keep = original.get(twin.keep)
    await attempt(`update “${keep.label}”`, () => api.updateExpense(keep.id, edited(keep, { description: twin.description })))
  }

  /** Removes a planned entry the bank never saw, or keeps it unconfirmed (still reserved). */
  const settle = async (missing, action) => {
    const e = original.get(missing.id)
    if (action === 'remove') {
      if (await attempt(`remove “${e.label}”`, () => api.deleteExpense(e.id))) done.removed++
    } else if (e.confirmed === false) {
      done.pending++
    } else if (await attempt(`mark “${e.label}” pending`, () => api.updateExpense(e.id, edited(e, { confirmed: false })))) {
      done.pending++
    }
  }

  /**
   * Expensave stores a balance update as the difference it made, so any write before one shifts every balance
   * after it. Each update is a bank balance, so it is set again (oldest first) at the value it had.
   */
  const anchor = async ({ date, at, balance, description, replace }) => {
    await attempt(`set the ${date} balance`, async () => {
      for (const id of replace) await api.deleteExpense(id)
      await api.balanceUpdate({ calendar: { id: calendar.id }, amount: balance, createdAt: at, description })
    })
  }

  return { confirm, add, refresh, merge, settle, anchor, errors, done }
}

const decisionFor = (missing, decisions) =>
  decisions[missing.id] === 'remove' || decisions[missing.id] === 'pending' ? decisions[missing.id] : missing.action

/** Earliest day whose balance the writes change, or undefined when none does. */
function firstChangedDay(plan, decisions) {
  return [
    ...plan.matched.flatMap((m) => [m.entry.date, ...m.rows.map((r) => r.date)]),
    ...plan.added.map((r) => r.date),
    ...plan.twins.map((t) => t.drop.date),
    ...plan.missing.filter((m) => m.confirmed || decisionFor(m, decisions) === 'remove').map((m) => m.date),
  ].sort()[0]
}

async function applyPlan(api, prepared, { balance, decisions }) {
  const { plan, anchors } = prepared
  const writer = createWriter(api, prepared)
  await pool(plan.matched, WRITE_CONCURRENCY, writer.confirm)
  await pool(plan.added, WRITE_CONCURRENCY, writer.add)
  await pool(plan.refreshed, WRITE_CONCURRENCY, writer.refresh)
  await pool(plan.twins, WRITE_CONCURRENCY, writer.merge)
  await pool(plan.missing, WRITE_CONCURRENCY, (m) => writer.settle(m, decisionFor(m, decisions)))

  // last, so Expensave computes each adjustment against the ledger as it now stands
  const changed = firstChangedDay(plan, decisions)
  const replaced = (a) => balance != null && a.date === plan.to
  const steps = anchors
    .filter((a) => changed && a.date >= changed && !replaced(a))
    .map((a) => ({ ...a, balance: round2(a.balance + landedOn(plan, a.date)), replace: [a.id] }))
  if (balance != null) {
    steps.push({
      date: plan.to,
      at: `${plan.to} 23:59:59`,
      balance,
      description: withTag('Bank balance from statement', 'balance'),
      replace: anchors.filter(replaced).map((a) => a.id),
    })
  }
  for (const step of steps.sort((a, b) => a.date.localeCompare(b.date))) await writer.anchor(step)
  if (balance != null && !writer.errors.some((e) => e.startsWith(`set the ${plan.to} balance`))) writer.done.balance = balance
  return writer
}

/** Reads the ledger back: every statement row must be in it, and the end balance must be the bank's. */
async function checkResult(api, { calendar, plan }, balance) {
  const payload = await api.expenses(calendar.id, plan.from, plan.to)
  const tags = new Set((payload.expenses ?? []).map(tagOf))
  const unwritten = new Set(plan.unwritten)
  const lost = plan.rows.filter((r) => !unwritten.has(r.fp) && !tags.has(r.fp))
  const problems = lost.map((r) => `not in Expensave: ${r.date} ${r.label} ${r.amount.toFixed(2)} — upload the same file again to retry`)
  const last = [...(payload.expenseBalances ?? [])].reverse().find((d) => String(d.balanceAt).slice(0, 10) <= plan.to)
  if (balance != null && last && Math.abs(Number(last.balance) - balance) >= 0.01) {
    problems.push(`Expensave shows ${Number(last.balance).toFixed(2)} on ${plan.to}, the bank ${balance.toFixed(2)}`)
  }
  return { lost: lost.length, problems }
}

const fail = (res, e) => {
  if (e instanceof BadRequest) return res.status(400).json({ error: e.message, ...e.extra })
  res.status(502).json({ error: e.message })
}

const optionalNumber = (v) => v == null || Number.isFinite(v)

/** Bank statement upload: status, dry-run preview and apply. */
export function importRouter(api, { stateFile, canWrite = true, onChange = () => {} } = {}) {
  const router = express.Router()

  router.get('/status', (_req, res) => {
    res.json({ lastImport: readState(stateFile), canWrite })
  })

  router.post('/preview', async (req, res) => {
    try {
      res.json(previewOf(await prepare(api, req.body), readState(stateFile), canWrite))
    } catch (e) {
      fail(res, e)
    }
  })

  router.post('/apply', async (req, res) => {
    if (!canWrite) return res.status(403).json({ error: 'editor disabled (EDITOR_ENABLED=0)' })
    const { balance = null, forecast = null } = req.body ?? {}
    if (!optionalNumber(balance)) return res.status(400).json({ error: 'balance must be a number' })
    if (!optionalNumber(forecast)) return res.status(400).json({ error: 'forecast must be a number' })
    const decisions = req.body?.decisions && typeof req.body.decisions === 'object' ? req.body.decisions : {}

    let prepared
    try {
      prepared = await prepare(api, req.body)
    } catch (e) {
      return fail(res, e)
    }
    const { errors, done } = await applyPlan(api, prepared, { balance, decisions })
    let lost = null
    try {
      const check = await checkResult(api, prepared, done.balance)
      lost = check.lost
      errors.push(...check.problems)
    } catch (e) {
      errors.push(`could not check the result: ${e.message}`)
    }
    const { plan } = prepared
    const state = {
      at: new Date().toISOString(),
      from: plan.from,
      to: plan.to,
      account: prepared.account,
      calendar: prepared.calendar.id,
      count: plan.count,
      ...done,
      lost,
      // what the Money page expected on `to` before this statement told it otherwise
      forecast: done.balance != null && forecast != null ? round2(forecast) : null,
      errors: errors.length,
    }
    try {
      writeState(stateFile, state)
    } catch (e) {
      errors.push(`could not save import status: ${e.message}`)
    }
    onChange()
    res.status(errors.length ? 207 : 200).json({ ...state, errors })
  })

  return router
}
