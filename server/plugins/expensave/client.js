const EXPENSAVE_URL = (process.env.EXPENSAVE_URL || '').replace(/\/+$/, '').replace(/\/api$/, '')
const EXPENSAVE_EMAIL = process.env.EXPENSAVE_EMAIL || ''
const EXPENSAVE_PASSWORD = process.env.EXPENSAVE_PASSWORD || ''

const TOKEN_FALLBACK_TTL_MS = 9 * 60_000
const TOKEN_EARLY_EXPIRY_MS = 30_000

export const expensaveUrl = EXPENSAVE_URL
export const expensaveConfigured = Boolean(EXPENSAVE_URL && EXPENSAVE_EMAIL && EXPENSAVE_PASSWORD)

// Refresh tokens are single-use, so an expired access token means logging in again.
let session = { token: null, exp: 0 }
let pendingLogin = null

const jwtExpiry = (token) => {
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    return Number(claims.exp) * 1000 || 0
  } catch {
    return 0
  }
}

async function login() {
  let r
  try {
    r = await fetch(`${EXPENSAVE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: EXPENSAVE_EMAIL, password: EXPENSAVE_PASSWORD }),
    })
  } catch (e) {
    throw new Error(`Expensave unreachable at ${EXPENSAVE_URL} (${e.cause?.code ?? e.message})`, { cause: e })
  }
  if (!r.ok) {
    throw new Error(r.status === 401
      ? 'Expensave login rejected — check EXPENSAVE_EMAIL/EXPENSAVE_PASSWORD'
      : `Expensave login failed: HTTP ${r.status}`)
  }
  const body = await r.json()
  const token = body.token ?? body.access_token
  if (!token) throw new Error('Expensave login returned no token')
  session = { token, exp: jwtExpiry(token) || Date.now() + TOKEN_FALLBACK_TTL_MS }
  return token
}

function authToken() {
  if (session.token && Date.now() < session.exp - TOKEN_EARLY_EXPIRY_MS) return Promise.resolve(session.token)
  pendingLogin ??= login().finally(() => { pendingLogin = null })
  return pendingLogin
}

/** Calls the Expensave API. Every request needs a JSON content type, GETs included. */
async function request(path, { method = 'GET', body } = {}, retried = false) {
  const token = await authToken()
  const r = await fetch(`${EXPENSAVE_URL}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if ((r.status === 401 || r.status === 403) && !retried) {
    session = { token: null, exp: 0 }
    return request(path, { method, body }, true)
  }
  if (!r.ok) {
    const detail = await r.text().catch(() => '')
    throw new Error(`Expensave ${method} ${path}: HTTP ${r.status}${detail ? ` ${detail.slice(0, 200)}` : ''}`)
  }
  const text = await r.text()
  return text ? JSON.parse(text) : null
}

export const expensaveApi = {
  calendars: () => request('/calendar'),
  expenses: (id, start, end) => request(`/calendar/${id}/expenses/${start}/${end}`),
  categories: () => request('/category'),
  suggest: (label) => request('/expense/suggest', { method: 'POST', body: { label } }),
  createExpense: (body) => request('/expense', { method: 'POST', body }),
  // without recurringUpdateScope only this occurrence changes
  updateExpense: (id, body) => request(`/expense/${id}`, { method: 'PUT', body }),
  deleteExpense: (id) => request(`/expense/${id}`, { method: 'DELETE' }),
  // `amount` is the wanted balance at `createdAt`; Expensave stores the difference
  balanceUpdate: (body) => request('/balance-update', { method: 'POST', body }),
}
