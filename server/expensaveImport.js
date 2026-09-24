import fs from 'node:fs'
import express from 'express'
import { balanceAfter, guessCategory, parseBankCsv, reconcile, withTag, PENDING_DAYS } from './bankImport.js'

/**
 * Bank statement upload for the Money page (see server/bankImport.js for the
 * reconciliation rules):
 *
 *   GET  /api/expensave/import/status    when the last statement was imported
 *   POST /api/expensave/import/preview   {csv, calendar?, account?} → what would change
 *   POST /api/expensave/import/apply     {csv, calendar?, account?, balance?, decisions?}
 *
 * Apply recomputes the plan from the CSV instead of trusting one sent back by
 * the browser, so it always acts on Expensave as it is now. The only inputs the
 * person adds are the bank balance and, per planned entry the bank never saw,
 * "remove" or "pending".
 */

const DAY = 86_400_000
const shift = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const round2 = (v) => Math.round(v * 100) / 100
// noon keeps an imported day on the same day whatever DST does
const noon = (day) => `${day} 12:00:00`

/** Run `fn` over `items` with at most `n` in flight. */
async function pool(items, n, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  }))
  return out
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

export function importRouter(api, { stateFile, canWrite = true, onChange = () => {} } = {}) {
  const router = express.Router()

  /** Parse, fetch the ledger around the statement and reconcile. Read-only. */
  async function prepare(body) {
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
    const rows = parsed.rows.filter((r) => r.account === account)

    const calendars = await api.calendars()
    const calendar = calendars.find((c) => c.id === Number(body.calendar)) ?? calendars[0]
    if (!calendar) throw new BadRequest('No Expensave calendar to import into')

    const from = rows[0].date
    const to = rows[rows.length - 1].date
    const start = shift(from, -PENDING_DAYS)
    const end = shift(to, PENDING_DAYS)
    const payload = await api.expenses(calendar.id, start, end)
    const entries = payload.expenses ?? []
    const days = payload.expenseBalances ?? []
    const first = days[0]
    const base = first ? round2(Number(first.balance) - Number(first.change)) : 0
    const plan = reconcile(rows, entries)
    const before = [...days].reverse().find((d) => String(d.balanceAt).slice(0, 10) <= to)

    // category per new row: Expensave's memory of this label first, then keywords
    const categories = await api.categories().catch(() => [])
    const labels = [...new Set([...plan.added, ...plan.matched.flatMap((m) => m.rows.slice(1))].map((r) => r.label))]
    const remembered = new Map()
    await pool(labels, 5, async (label) => {
      const hit = await api.suggest(label).catch(() => null)
      if (hit?.category && hit.category.type !== 'balance_update' && hit.label?.toLowerCase() === label.toLowerCase()) {
        remembered.set(label, hit.category.id)
      }
    })
    const catById = new Map(categories.map((c) => [c.id, c]))
    const categoryFor = (r) => remembered.get(r.label) ?? guessCategory(r, categories)

    return {
      calendar,
      account,
      accounts,
      rows,
      plan,
      entries,
      categoryFor,
      catName: (id) => catById.get(id)?.name ?? null,
      expensaveBalance: before ? round2(Number(before.balance)) : base,
      balanceAfter: balanceAfter(plan, entries, base),
    }
  }

  const fail = (res, e) => {
    if (e instanceof BadRequest) return res.status(400).json({ error: e.message, ...e.extra })
    res.status(502).json({ error: e.message })
  }

  const pickRow = (r) => ({ date: r.date, amount: r.amount, label: r.label, raw: r.raw })

  router.get('/status', (_req, res) => {
    res.json({ lastImport: readState(stateFile), canWrite })
  })

  router.post('/preview', async (req, res) => {
    try {
      const p = await prepare(req.body)
      const last = readState(stateFile)
      res.json({
        from: p.plan.from,
        to: p.plan.to,
        count: p.plan.count,
        account: p.account,
        accounts: p.accounts,
        calendar: { id: p.calendar.id, name: p.calendar.name },
        matched: p.plan.matched.map((m) => ({ entry: m.entry, rows: m.rows.map(pickRow) })),
        added: p.plan.added.map((r) => ({ ...pickRow(r), category: p.catName(p.categoryFor(r)) })),
        duplicates: p.plan.duplicates,
        missing: p.plan.missing,
        bankBalance: p.plan.bankBalance,
        expensaveBalance: p.expensaveBalance,
        balanceAfter: p.balanceAfter,
        // days the previous statement did not reach: those transactions are
        // missing for good unless an older export fills them in
        gapDays: last?.to && last.account === p.account
          ? Math.max(0, Math.round((Date.parse(p.plan.from) - Date.parse(last.to)) / DAY) - 1)
          : 0,
        lastImport: last,
        canWrite,
      })
    } catch (e) {
      fail(res, e)
    }
  })

  router.post('/apply', async (req, res) => {
    if (!canWrite) return res.status(403).json({ error: 'editor disabled (EDITOR_ENABLED=0)' })
    const balance = req.body?.balance
    if (balance != null && !Number.isFinite(balance)) return res.status(400).json({ error: 'balance must be a number' })
    const decisions = req.body?.decisions && typeof req.body.decisions === 'object' ? req.body.decisions : {}

    let p
    try {
      p = await prepare(req.body)
    } catch (e) {
      return fail(res, e)
    }
    const { plan, calendar, entries, categoryFor } = p
    const raw = new Map(entries.map((e) => [e.id, e]))
    const errors = []
    const done = { matched: 0, added: 0, removed: 0, pending: 0, balance: null }
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
    const edit = (e, patch) => ({
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

    // the planned entry becomes the real one: its label and category, the bank's date and amount
    await pool(plan.matched, 4, async (m) => {
      const e = raw.get(m.entry.id)
      const [first, ...rest] = m.rows
      const ok = await attempt(`update “${e.label}”`, () => api.updateExpense(e.id, edit(e, {
        amount: first.amount,
        createdAt: noon(first.date),
        confirmed: true,
        description: withTag(first.raw, first.fp),
      })))
      for (const r of rest) await attempt(`add “${r.label}”`, () => api.createExpense(newRow(r, e.label, e.category?.id)))
      if (ok) done.matched++
    })

    await pool(plan.added, 4, async (r) => {
      if (await attempt(`add “${r.label}”`, () => api.createExpense(newRow(r)))) done.added++
    })

    await pool(plan.missing, 4, async (m) => {
      const e = raw.get(m.id)
      const action = decisions[m.id] === 'remove' || decisions[m.id] === 'pending' ? decisions[m.id] : m.action
      if (action === 'remove') {
        if (await attempt(`remove “${e.label}”`, () => api.deleteExpense(e.id))) done.removed++
      } else if (e.confirmed !== false) {
        // unconfirmed = not in the balance, but still reserved by the set-aside math
        if (await attempt(`mark “${e.label}” pending`, () => api.updateExpense(e.id, edit(e, { confirmed: false })))) done.pending++
      } else done.pending++
    })

    // last, so Expensave computes the adjustment against the ledger as it now stands
    if (balance != null) {
      for (const id of plan.staleAnchors) await attempt('replace old balance', () => api.deleteExpense(id))
      await attempt('set balance', async () => {
        await api.balanceUpdate({
          calendar: { id: calendar.id },
          amount: balance,
          createdAt: `${plan.to} 23:59:59`,
          description: withTag('Bank balance from statement', 'balance'),
        })
        done.balance = balance
      })
    }

    const state = {
      at: new Date().toISOString(),
      from: plan.from,
      to: plan.to,
      account: p.account,
      calendar: calendar.id,
      count: plan.count,
      ...done,
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
