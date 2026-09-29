import type { EntityState } from './types'

/**
 * Game model for the NHL API integration (github.com/JayBlackedOut/hass-nhlapi).
 * Its sensor's state is a display string ("Today, 7:00 PM", "LIVE", …); the
 * attributes carry the real data, with `game_state` giving the phase.
 */

export type GamePhase = 'none' | 'scheduled' | 'pregame' | 'live' | 'final'

export interface HockeyTeam {
  id: number | null
  abbrev: string
  name: string
  /** nickname without the city ("Canadiens"), for tight layouts */
  shortName: string
  record: string | null
  logo: string | null
  logoDark: string | null
  score: number | null
  sog: number | null
  color: string
  tracked: boolean
}

export interface HockeyGoal {
  teamAbbrev: string | null
  tracked: boolean
  scorer: string
  number: number | null
  total: number | null
  /** EVEN, PPG, SHG, … as the API reports it */
  strength: string | null
  assists: { name: string; number: number | null; total: number | null }[]
  eventId: number | null
}

export interface HockeySeries {
  round: number | null
  game: number | null
  topSeed: string
  topWins: number
  bottomSeed: string
  bottomWins: number
}

export interface HockeyGame {
  phase: GamePhase
  /** last 5 minutes of regulation (the integration's CRIT state) */
  critical: boolean
  start: Date | null
  away: HockeyTeam
  home: HockeyTeam
  period: number | null
  periodType: 'REG' | 'OT' | 'SO' | null
  timeRemaining: string | null
  intermission: boolean
  broadcasts: string[]
  /** 1 pre-season, 2 regular season, 3 playoffs */
  gameType: number | null
  link: string | null
  lastGoal: HockeyGoal | null
  series: HockeySeries | null
}

/** Primary colour and nickname per team, keyed by the NHL's tri-code. */
export const NHL_TEAMS: Record<string, { color: string; nick: string }> = {
  ANA: { color: '#F47A38', nick: 'Ducks' },
  BOS: { color: '#FFB81C', nick: 'Bruins' },
  BUF: { color: '#003087', nick: 'Sabres' },
  CAR: { color: '#CE1126', nick: 'Hurricanes' },
  CBJ: { color: '#002654', nick: 'Blue Jackets' },
  CGY: { color: '#C8102E', nick: 'Flames' },
  CHI: { color: '#CF0A2C', nick: 'Blackhawks' },
  COL: { color: '#6F263D', nick: 'Avalanche' },
  DAL: { color: '#006847', nick: 'Stars' },
  DET: { color: '#CE1126', nick: 'Red Wings' },
  EDM: { color: '#FF4C00', nick: 'Oilers' },
  FLA: { color: '#C8102E', nick: 'Panthers' },
  LAK: { color: '#572A84', nick: 'Kings' },
  MIN: { color: '#154734', nick: 'Wild' },
  MTL: { color: '#AF1E2D', nick: 'Canadiens' },
  NJD: { color: '#CE1126', nick: 'Devils' },
  NSH: { color: '#FFB81C', nick: 'Predators' },
  NYI: { color: '#00539B', nick: 'Islanders' },
  NYR: { color: '#0038A8', nick: 'Rangers' },
  OTT: { color: '#C52032', nick: 'Senators' },
  PHI: { color: '#F74902', nick: 'Flyers' },
  PIT: { color: '#FCB514', nick: 'Penguins' },
  SEA: { color: '#68A2B9', nick: 'Kraken' },
  SJS: { color: '#006D75', nick: 'Sharks' },
  STL: { color: '#002F87', nick: 'Blues' },
  TBL: { color: '#002868', nick: 'Lightning' },
  TOR: { color: '#00205B', nick: 'Maple Leafs' },
  UTA: { color: '#71AFE5', nick: 'Mammoth' },
  VAN: { color: '#00205B', nick: 'Canucks' },
  VGK: { color: '#B4975A', nick: 'Golden Knights' },
  WPG: { color: '#041E42', nick: 'Jets' },
  WSH: { color: '#C8102E', nick: 'Capitals' },
}

const PHASES: Record<string, GamePhase> = {
  FUT: 'scheduled', PRE: 'pregame', LIVE: 'live', CRIT: 'live', OVER: 'final', FINAL: 'final', OFF: 'final',
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/** "…/svg/MTL_light.svg" → "MTL" */
export const abbrevFromLogo = (url: string | null): string | null =>
  url?.match(/\/([A-Z]{2,4})_(?:light|dark)\.svg/i)?.[1]?.toUpperCase() ?? null

/** The team a sensor tracks: explicit config wins, else the `nhl_mtl`-style entity id. */
export const trackedAbbrev = (entity: string | undefined, team?: string): string | null => {
  if (team?.trim()) return team.trim().toUpperCase()
  const m = entity?.match(/nhl_([a-z]{2,4})$/i)
  return m ? m[1].toUpperCase() : null
}

const nickname = (name: string, abbrev: string): string => {
  const known = NHL_TEAMS[abbrev]?.nick
  if (known) return known
  const words = name.split(/\s+/)
  return words.length > 1 ? words.slice(1).join(' ') : name
}

export function parseHockey(st: EntityState | null | undefined, tracked: string | null): HockeyGame | null {
  if (!st || st.state === 'unavailable' || st.state === 'unknown') return null
  const a = st.attributes ?? {}
  const phase: GamePhase = PHASES[String(a.game_state ?? '').toUpperCase()] ?? 'none'

  const team = (side: 'away' | 'home'): HockeyTeam => {
    const logo = str(a[`${side}_logo`])
    const name = str(a[`${side}_name`]) ?? ''
    const abbrev = abbrevFromLogo(logo) ?? name.slice(0, 3).toUpperCase()
    return {
      id: num(a[`${side}_id`]),
      abbrev,
      name,
      shortName: nickname(name, abbrev),
      record: str(a[`${side}_record`]),
      logo,
      logoDark: str(a[`${side}_logo_dark`]) ?? logo,
      score: num(a[`${side}_score`]),
      sog: num(a[`${side}_sog`]),
      color: NHL_TEAMS[abbrev]?.color ?? '#6b6f7a',
      tracked: !!tracked && abbrev === tracked,
    }
  }
  const away = team('away')
  const home = team('home')

  const startRaw = str(a.next_game_datetime)
  const start = startRaw ? new Date(startRaw) : null

  const byId = (id: number | null) => (id == null ? null : id === away.id ? away : id === home.id ? home : null)
  const scorer = str(a.scoring_player_name)
  const goalTeam = byId(num(a.goal_team_id))
  const lastGoal: HockeyGoal | null = scorer ? {
    teamAbbrev: goalTeam?.abbrev ?? null,
    tracked: a.goal_tracked_team === true || !!goalTeam?.tracked,
    scorer,
    number: num(a.scoring_player_number),
    total: num(a.scoring_player_total),
    strength: str(a.goal_type),
    assists: [1, 2]
      .map((i) => ({
        name: str(a[`assist${i}_player_name`]),
        number: num(a[`assist${i}_player_number`]),
        total: num(a[`assist${i}_player_total`]),
      }))
      .filter((x): x is { name: string; number: number | null; total: number | null } => !!x.name),
    eventId: num(a.goal_event_id),
  } : null

  const topSeed = str(a.series_top_seed)
  const bottomSeed = str(a.series_bottom_seed)
  const series: HockeySeries | null = topSeed && bottomSeed ? {
    round: num(a.series_round),
    game: num(a.series_game),
    topSeed: topSeed.toUpperCase(),
    topWins: num(a.series_top_seed_wins) ?? 0,
    bottomSeed: bottomSeed.toUpperCase(),
    bottomWins: num(a.series_bottom_seed_wins) ?? 0,
  } : null

  const pType = str(a.current_period_type)?.toUpperCase()
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

  return {
    phase,
    critical: String(a.game_state ?? '').toUpperCase() === 'CRIT',
    start: start && !isNaN(start.getTime()) ? start : null,
    away,
    home,
    period: num(a.current_period),
    periodType: pType === 'REG' || pType === 'OT' || pType === 'SO' ? pType : null,
    timeRemaining: str(a.time_remaining),
    intermission: a.is_intermission === true,
    broadcasts: [...new Set([...list(a.national_broadcasts), ...list(a.home_broadcasts), ...list(a.away_broadcasts)])],
    gameType: num(a.game_type),
    link: str(a.live_feed),
    lastGoal,
    series,
  }
}

/** The tracked side and its opponent; away-first when the tracked team is unknown. */
export const sides = (g: HockeyGame): { us: HockeyTeam; them: HockeyTeam } =>
  g.home.tracked ? { us: g.home, them: g.away } : { us: g.away, them: g.home }

/** 'W' | 'L' once final, from the tracked team's point of view. */
export const result = (g: HockeyGame): 'W' | 'L' | null => {
  const { us, them } = sides(g)
  if (g.phase !== 'final' || !us.tracked || us.score == null || them.score == null || us.score === them.score) return null
  return us.score > them.score ? 'W' : 'L'
}

/**
 * i18n key + vars for the period. Regulation periods are 1–3; in the playoffs
 * overtime keeps counting (period 5 = 2OT).
 */
export const periodLabel = (g: HockeyGame): { key: string; vars?: Record<string, number> } | null => {
  if (g.periodType === 'SO') return { key: 'hockey.periodSO' }
  if (g.periodType === 'OT' || (g.period != null && g.period > 3)) {
    const n = g.period != null ? g.period - 3 : 1
    return n > 1 ? { key: 'hockey.periodNOT', vars: { n } } : { key: 'hockey.periodOT' }
  }
  if (g.period == null || g.period < 1) return null
  return { key: `hockey.period${g.period}` }
}

/** Time left until `start`, broken into parts for the countdown (null once it's passed). */
export const countdown = (start: Date | null, now: Date): { days: number; hours: number; minutes: number } | null => {
  if (!start) return null
  const ms = start.getTime() - now.getTime()
  if (ms <= 0) return null
  const mins = Math.ceil(ms / 60_000)
  return { days: Math.floor(mins / 1440), hours: Math.floor((mins % 1440) / 60), minutes: mins % 60 }
}
