const PORTAL_URL = 'https://portal3.clicsante.ca/'
const SETTINGS_URL = 'https://api3.clicsante.ca/v3/globalSettings'
const QUEBEC_URL = 'https://www.quebec.ca/sante/conseils-et-prevention/vaccination/vaccination-contre-infections-respiratoires'
/** What Clic Santé's own portal sends for anonymous visitors. */
const CLICSANTE_HEADERS = { PRODUCT: 'clicsante', 'X-TRIMOZ-ROLE': 'public' }
const USER_AGENT = 'HomeBoard (+https://github.com/DavidBilodeau1/homeboard)'
const TIMEOUT_MS = 20_000
/** Seasons start in July: campaigns open in the fall and run through spring. */
const SEASON_START_MONTH = 6
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export const seasonStartYear = (date) => (date.getMonth() >= SEASON_START_MONTH ? date.getFullYear() : date.getFullYear() - 1)

export const seasonLabel = (year) => `${year}-${year + 1}`

/** Clic Santé's switch for a season's campaign, assuming it keeps the name it used in 2026. */
export const campaignFlagName = (year) => `ENABLE_FLU_COVID_CAMPAIGN_${year}`

async function download(url, headers = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!r.ok) throw new Error(`${new URL(url).host}: HTTP ${r.status}`)
  return r
}

/** The portal's main script, where it declares its setting ids. */
export function mainScriptUrl(html) {
  const src = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)?.[1]
  return src ? new URL(src, PORTAL_URL).href : null
}

export function flagId(script, name) {
  const id = script.match(new RegExp(`\\b${name}:(\\d+)\\b`))?.[1]
  return id ? Number(id) : null
}

/** Setting ids only change when the portal ships a new script. */
let knownFlag = { script: null, name: null, id: null }

export async function checkClicSante(year) {
  const name = campaignFlagName(year)
  const script = mainScriptUrl(await (await download(PORTAL_URL)).text())
  if (!script) throw new Error('Clic Santé portal script not found')
  if (knownFlag.script !== script || knownFlag.name !== name) {
    knownFlag = { script, name, id: flagId(await (await download(script)).text(), name) }
  }
  // the flag usually appears weeks before the campaign; until then only Québec.ca can tell
  if (knownFlag.id == null) return { state: 'missing', flag: name }
  const settings = await (await download(SETTINGS_URL, CLICSANTE_HEADERS)).json()
  return { state: settings?.[knownFlag.id]?.value === true ? 'open' : 'closed', flag: name }
}

/** The "Prise de rendez-vous" box, up to the next content block. */
export function bookingBox(html) {
  return html.match(/<h2[^>]*>\s*(?:Prise de|Prendre un) rendez-vous\s*<\/h2>([\s\S]*?)(?=<h2|<div id="c\d+"|<\/main>)/i)?.[1] ?? null
}

export function lastUpdated(html) {
  const m = html.match(/Dernière mise à jour\s*:\s*(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{4})/i)
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1
  return month < 0 ? null : new Date(Number(m[3]), month, Number(m[1]))
}

const isBookingLink = (href) => /^https?:\/\//.test(href) && !/^https?:\/\/(www\.)?quebec\.ca(\/|$)/.test(href)

/** Before booking opens the box only says a link will be added; once it opens, the link to book is there. */
export function readQuebecPage(html, year) {
  const box = bookingBox(html)
  if (box == null) throw new Error('Québec.ca booking box not found')
  const link = [...box.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).find(isBookingLink) ?? null
  const updated = lastUpdated(html)
  // a box still open from last season must not count for this one
  const thisSeason = !updated || updated >= new Date(year, SEASON_START_MONTH, 1)
  return { state: link && thisSeason ? 'open' : 'closed', link }
}

export async function checkQuebec(year) {
  return readQuebecPage(await (await download(QUEBEC_URL)).text(), year)
}
