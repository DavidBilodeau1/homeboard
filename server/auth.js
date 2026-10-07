import crypto from 'crypto'
import fs from 'fs'
import express from 'express'

const SESSION_COOKIE = 'hb_session'
const STATE_COOKIE = 'hb_oauth_state'
const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000
const STATE_TTL_MS = 10 * 60_000

/** Reads the persisted cookie-signing secret, creating it on first boot. */
function loadSecret(file) {
  try { return fs.readFileSync(file, 'utf8').trim() } catch { /* first boot */ }
  const secret = crypto.randomBytes(32).toString('hex')
  try {
    fs.writeFileSync(file, secret, { mode: 0o600 })
  } catch (e) {
    console.warn(`[homeboard] could not persist session secret: ${e.message}`)
  }
  return secret
}

/** Stateless signed tokens: `base64url(json).signature`. */
function createSigner(secret) {
  const hmac = (data) => crypto.createHmac('sha256', secret).update(data).digest('base64url')

  const sign = (payload) => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    return `${body}.${hmac(body)}`
  }

  const verify = (token) => {
    if (typeof token !== 'string') return null
    const [body, signature] = token.split('.')
    if (!body || !signature) return null
    const expected = hmac(body)
    const valid = signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    if (!valid) return null
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
      return payload.exp && Date.now() > payload.exp ? null : payload
    } catch {
      return null
    }
  }

  return { sign, verify }
}

const parseCookies = (req) => Object.fromEntries(
  (req.headers.cookie || '').split(';').map((cookie) => {
    const i = cookie.indexOf('=')
    return i < 0 ? [cookie.trim(), ''] : [cookie.slice(0, i).trim(), decodeURIComponent(cookie.slice(i + 1).trim())]
  }).filter(([name]) => name),
)

function setCookie(req, res, name, value, maxAgeMs) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https'
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/', 'HttpOnly', 'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
    secure ? 'Secure' : '',
  ].filter(Boolean)
  res.append('Set-Cookie', parts.join('; '))
}

const clearCookie = (res, name) => res.append('Set-Cookie', `${name}=; Path=/; HttpOnly; Max-Age=0`)

/** "Log in with Home Assistant" via HA's OAuth2 (IndieAuth) flow; when disabled every request is the `local` user. */
export function createAuth({ enabled, haUrl, publicUrl, secret, secretFile }) {
  const signer = enabled ? createSigner(secret || loadSecret(secretFile)) : null
  const clientId = publicUrl
  const redirectUri = `${publicUrl}/auth/callback`

  const sessionUser = (req) => (enabled ? signer.verify(parseCookies(req)[SESSION_COOKIE])?.sub ?? null : 'local')

  const requireAuth = (req, res, next) => {
    if (sessionUser(req)) return next()
    res.status(401).json({ error: 'authentication required' })
  }

  const exchangeCode = (code) => fetch(`${haUrl}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: String(code), client_id: clientId }),
  })

  const router = express.Router()

  router.get('/api/session', (req, res) => {
    const user = sessionUser(req)
    res.json({ authEnabled: enabled, authenticated: !!user, user })
  })

  router.get('/auth/login', (req, res) => {
    if (!enabled) return res.redirect('/')
    const state = crypto.randomBytes(16).toString('hex')
    setCookie(req, res, STATE_COOKIE, signer.sign({ state, exp: Date.now() + STATE_TTL_MS }), STATE_TTL_MS)
    res.redirect(`${haUrl}/auth/authorize?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`)
  })

  router.get('/auth/callback', async (req, res) => {
    if (!enabled) return res.redirect('/')
    const { code, state } = req.query
    const expected = signer.verify(parseCookies(req)[STATE_COOKIE])
    clearCookie(res, STATE_COOKIE)
    if (!code || !state || expected?.state !== state) return res.redirect('/?auth_error=state')
    try {
      const r = await exchangeCode(code)
      if (!r.ok) {
        console.warn(`[homeboard] token exchange failed: HTTP ${r.status}`)
        return res.redirect('/?auth_error=token')
      }
      const now = Date.now()
      setCookie(req, res, SESSION_COOKIE, signer.sign({ sub: 'hass', iat: now, exp: now + SESSION_TTL_MS }), SESSION_TTL_MS)
      res.redirect('/')
    } catch (e) {
      console.warn(`[homeboard] auth callback error: ${e.message}`)
      res.redirect('/?auth_error=exchange')
    }
  })

  router.post('/auth/logout', (_req, res) => {
    clearCookie(res, SESSION_COOKIE)
    res.json({ ok: true })
  })

  return { router, requireAuth, sessionUser }
}
