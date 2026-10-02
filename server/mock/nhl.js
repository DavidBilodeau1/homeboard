/** Demo sensor of the NHL API integration; MOCK_NHL=scheduled|live|final|goals picks the game phase. */

const GOAL_FEED_MS = 30_000
const GOAL_SCORERS = [
  ['Cole Caufield', 13, 'Nick Suzuki', 14, 'EVEN'],
  ['Nick Suzuki', 14, 'Juraj Slafkovsky', 20, 'PPG'],
  ['Ivan Demidov', 93, 'Lane Hutson', 48, 'EVEN'],
  ['Juraj Slafkovsky', 20, 'Cole Caufield', 13, 'SHG'],
]

const phase = process.env.MOCK_NHL || 'live'
let goalsScored = 0

/** In the `goals` phase the tracked team scores every 30 s; `onChange` announces it. */
export function startGoalFeed(entityId, onChange) {
  if (phase !== 'goals') return
  setInterval(() => {
    goalsScored++
    onChange(entityId)
  }, GOAL_FEED_MS)
}

const tonightAt = (hour, dayOffset = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour, 0, 0, 0)
  return d
}

const baseAttributes = (start) => ({
  national_broadcasts: ['SN', 'TVAS'], away_broadcasts: [], home_broadcasts: ['RDS'],
  game_id: 2026020002, game_type: 2,
  live_feed: 'https://www.nhl.com/gamecenter/mtl-vs-tor/2026/09/29/2026020002',
  away_id: 8, home_id: 10,
  away_name: 'Montréal Canadiens', home_name: 'Toronto Maple Leafs',
  away_record: '4-1-1', home_record: '3-2-0',
  away_logo: 'https://assets.nhle.com/logos/nhl/svg/MTL_light.svg',
  home_logo: 'https://assets.nhle.com/logos/nhl/svg/TOR_light.svg',
  away_logo_dark: 'https://assets.nhle.com/logos/nhl/svg/MTL_dark.svg',
  home_logo_dark: 'https://assets.nhle.com/logos/nhl/svg/TOR_dark.svg',
  next_game_datetime: start.toISOString(),
  friendly_name: 'NHL MTL', icon: 'mdi:hockey-sticks',
})

const lastGoal = () => {
  const goal = {
    goal_type: 'PPG', goal_team_id: 8, goal_event_id: 412, goal_team_name: 'Montréal Canadiens',
    scoring_player_name: 'Cole Caufield', scoring_player_number: 13, scoring_player_total: 5,
    assist1_player_name: 'Nick Suzuki', assist1_player_number: 14, assist1_player_total: 7,
    assist2_player_name: 'Lane Hutson', assist2_player_number: 48, assist2_player_total: 6,
    goal_tracked_team: true,
  }
  if (phase !== 'goals') return goal
  const [name, number, assist, assistNumber, strength] = GOAL_SCORERS[goalsScored % GOAL_SCORERS.length]
  const { assist2_player_name: _dropped, ...single } = goal
  return {
    ...single,
    goal_event_id: 412 + goalsScored, goal_type: strength,
    scoring_player_name: name, scoring_player_number: number, scoring_player_total: 5 + goalsScored,
    assist1_player_name: assist, assist1_player_number: assistNumber, assist1_player_total: 7 + goalsScored,
  }
}

export function nhlState() {
  if (phase === 'scheduled') {
    return { state: 'Tomorrow, 7:00 PM', attributes: { ...baseAttributes(tonightAt(19, 1)), game_state: 'FUT', away_score: 0, home_score: 0 } }
  }
  const attributes = { ...baseAttributes(tonightAt(19)), ...lastGoal() }
  if (phase === 'final') {
    return {
      state: 'FINAL',
      attributes: {
        ...attributes, game_state: 'FINAL', away_score: 4, home_score: 3,
        away_sog: 33, home_sog: 29, current_period: 4, current_period_type: 'OT', time_remaining: '00:00',
      },
    }
  }
  const extra = phase === 'goals' ? goalsScored : 0
  return {
    state: 'LIVE',
    attributes: {
      ...attributes, game_state: 'LIVE', away_score: 3 + extra, home_score: 2,
      away_sog: 24 + extra * 3, home_sog: 19, current_period: 2, current_period_type: 'REG', time_remaining: '07:42',
      is_intermission: false,
    },
  }
}
