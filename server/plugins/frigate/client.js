const FRIGATE_URL = (process.env.FRIGATE_URL || '').replace(/\/+$/, '').replace(/\/api$/, '')
const FRIGATE_USER = process.env.FRIGATE_USER || ''
const FRIGATE_PASSWORD = process.env.FRIGATE_PASSWORD || ''

export const frigateUrl = FRIGATE_URL

let token = process.env.FRIGATE_TOKEN || null

async function login() {
  if (!FRIGATE_USER || !FRIGATE_PASSWORD) return null
  const r = await fetch(`${FRIGATE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: FRIGATE_USER, password: FRIGATE_PASSWORD }),
    redirect: 'manual',
  })
  if (!r.ok && r.status !== 302) throw new Error(`Frigate login failed: HTTP ${r.status}`)
  // the JWT arrives as a cookie whose name is configurable in Frigate
  const cookies = r.headers.getSetCookie?.().join(',') ?? r.headers.get('set-cookie') ?? ''
  token = /(?:^|[;,\s])([a-z_]*token[a-z_]*)=([^;,\s]+)/i.exec(cookies)?.[2] ?? null
  if (!token) throw new Error('Frigate login returned no token cookie')
  return token
}

/** Fetches a Frigate API path, logging in again once when the token went stale. */
export async function frigateFetch(path, init = {}, retried = false) {
  const headers = { ...init.headers }
  if (token) headers.Authorization = `Bearer ${token}`
  const r = await fetch(`${FRIGATE_URL}/api${path}`, { ...init, headers, redirect: 'manual' })
  const rejected = r.status === 401 || r.status === 403 || (r.status === 302 && !init.stream)
  if (rejected && !retried && FRIGATE_USER) {
    await login()
    return frigateFetch(path, init, true)
  }
  return r
}

export async function frigateJson(path) {
  const r = await frigateFetch(path)
  if (r.ok) return r.json()
  const hint = (r.status === 401 || r.status === 403) && !FRIGATE_USER
    ? ' — set FRIGATE_USER/FRIGATE_PASSWORD so HomeBoard can renew its token'
    : ''
  throw new Error(`Frigate ${path}: HTTP ${r.status}${hint}`)
}
