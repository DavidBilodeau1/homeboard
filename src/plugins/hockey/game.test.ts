import { describe, expect, it } from 'vitest'
import { abbrevFromLogo, countdown, parseHockey, periodLabel, result, sides, trackedAbbrev } from './game'

const base = {
  national_broadcasts: ['SN', 'TVAS'], away_broadcasts: [], home_broadcasts: ['TVAS', 'RDS'],
  away_id: 8, home_id: 10,
  away_name: 'Montréal Canadiens', home_name: 'Toronto Maple Leafs',
  away_record: '0-0-0', home_record: '0-0-0',
  away_logo: 'https://assets.nhle.com/logos/nhl/svg/MTL_light.svg',
  home_logo: 'https://assets.nhle.com/logos/nhl/svg/TOR_light.svg',
  away_logo_dark: 'https://assets.nhle.com/logos/nhl/svg/MTL_dark.svg',
  home_logo_dark: 'https://assets.nhle.com/logos/nhl/svg/TOR_dark.svg',
  away_score: 0, home_score: 0,
  next_game_datetime: '2026-09-29T19:00:00-04:00',
  game_type: 2,
}
const st = (attrs: Record<string, unknown>, state = 'x') => ({ state, attributes: { ...base, ...attrs } })

describe('hockey', () => {
  it('finds the tracked team from config or entity id', () => {
    expect(trackedAbbrev('sensor.nhl_mtl')).toBe('MTL')
    expect(trackedAbbrev('sensor.canadiens')).toBeNull()
    expect(trackedAbbrev('sensor.canadiens', 'mtl')).toBe('MTL')
    expect(abbrevFromLogo(base.home_logo)).toBe('TOR')
  })

  it('parses a scheduled game (the real sensor shape)', () => {
    const g = parseHockey(st({ game_state: 'FUT', current_period: null, away_sog: null }, 'Today, 7:00 PM'), 'MTL')!
    expect(g.phase).toBe('scheduled')
    expect(g.away).toMatchObject({ abbrev: 'MTL', shortName: 'Canadiens', tracked: true, sog: null })
    expect(g.home).toMatchObject({ abbrev: 'TOR', shortName: 'Maple Leafs', tracked: false })
    expect(g.broadcasts).toEqual(['SN', 'TVAS', 'RDS'])
    expect(g.start?.toISOString()).toBe('2026-09-29T23:00:00.000Z')
    expect(sides(g).us.abbrev).toBe('MTL')
    expect(g.lastGoal).toBeNull()
  })

  it('reads live state, last goal and period', () => {
    const g = parseHockey(st({
      game_state: 'CRIT', current_period: '3', current_period_type: 'REG', time_remaining: '04:12',
      away_score: 2, home_score: 1, scoring_player_name: 'Cole Caufield', scoring_player_number: 13,
      goal_team_id: 8, goal_event_id: 99, assist1_player_name: 'Nick Suzuki',
    }), 'MTL')!
    expect(g.phase).toBe('live')
    expect(g.critical).toBe(true)
    expect(periodLabel(g)).toEqual({ key: 'hockey.period3' })
    expect(g.lastGoal).toMatchObject({ scorer: 'Cole Caufield', teamAbbrev: 'MTL', tracked: true, eventId: 99 })
    expect(g.lastGoal!.assists.map((a) => a.name)).toEqual(['Nick Suzuki'])
  })

  it('labels overtime periods and the shootout', () => {
    const at = (period: number, type: string) => periodLabel(parseHockey(st({ game_state: 'LIVE', current_period: period, current_period_type: type }), null)!)
    expect(at(4, 'OT')).toEqual({ key: 'hockey.periodOT' })
    expect(at(5, 'OT')).toEqual({ key: 'hockey.periodNOT', vars: { n: 2 } })
    expect(at(5, 'SO')).toEqual({ key: 'hockey.periodSO' })
  })

  it('gives the result from the tracked side', () => {
    const final = (a: number, h: number, team: string | null) =>
      result(parseHockey(st({ game_state: 'OFF', away_score: a, home_score: h }), team)!)
    expect(final(4, 3, 'MTL')).toBe('W')
    expect(final(1, 3, 'MTL')).toBe('L')
    expect(final(1, 3, 'TOR')).toBe('W')
    expect(final(4, 3, null)).toBeNull()
  })

  it('treats a sensor with no game as none', () => {
    expect(parseHockey({ state: 'No Game Scheduled', attributes: {} }, 'MTL')!.phase).toBe('none')
    expect(parseHockey({ state: 'unavailable', attributes: {} }, 'MTL')).toBeNull()
  })

  it('counts down to puck drop', () => {
    const start = new Date('2026-09-29T19:00:00')
    expect(countdown(start, new Date('2026-09-29T16:45:30'))).toEqual({ days: 0, hours: 2, minutes: 15 })
    expect(countdown(start, new Date('2026-09-27T18:00:00'))).toEqual({ days: 2, hours: 1, minutes: 0 })
    expect(countdown(start, new Date('2026-09-29T19:01:00'))).toBeNull()
  })
})
