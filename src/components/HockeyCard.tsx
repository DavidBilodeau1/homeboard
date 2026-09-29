import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { countdown, parseHockey, periodLabel, result, sides, trackedAbbrev, type HockeyGame, type HockeyTeam } from '../hockey'
import { fmtTime, isSameDay, addDays } from '../util'
import { HockeyIcon } from '../icons'

/** How long the "GOAL!" banner stays up after the tracked team scores. */
const CELEBRATE_MS = 12_000

/** Dashboard tile: the tracked team's next, current or just-finished game. */
export function HockeyCard({ linkable = true }: { linkable?: boolean }) {
  const { config, hockey, now, locale, t, resolvedTheme } = useStore()
  const tracked = trackedAbbrev(config?.hockey?.entity, config?.hockey?.team)
  const game = useMemo(() => parseHockey(hockey, tracked), [hockey, tracked])
  const celebrating = useGoalCelebration(game)

  if (!config?.hockey?.entity) {
    return (
      <section className="card nhl-card nhl-empty">
        <h2 className="card-title"><HockeyIcon size={18} /> {t('hockey.title')}</h2>
        <div className="cal-empty">{t('hockey.notConfigured')}</div>
      </section>
    )
  }

  if (!game || game.phase === 'none') {
    return (
      <section className="card nhl-card nhl-empty">
        <h2 className="card-title"><HockeyIcon size={18} /> {t('hockey.title')}</h2>
        <div className="nhl-off">
          <HockeyIcon size={40} />
          <span>{game ? t('hockey.noGame') : t('state.unavailable')}</span>
        </div>
      </section>
    )
  }

  const { us, them } = sides(game)
  const dark = resolvedTheme === 'dark'
  const open = linkable && game.link ? () => window.open(game.link!, '_blank', 'noopener') : undefined

  return (
    <section
      className={`card nhl-card phase-${game.phase}${game.critical ? ' crit' : ''}${celebrating ? ' goal' : ''}`}
      style={{ '--team': us.tracked ? us.color : 'var(--accent)', '--opp': them.color } as React.CSSProperties}
      onClick={open}
      role={open ? 'link' : undefined}
    >
      <header className="nhl-head">
        {status(game, now)}
        {tag(game)}
      </header>

      <div className="nhl-matchup">
        {teamBlock(game.away, dark)}
        {center(game, now)}
        {teamBlock(game.home, dark)}
      </div>

      {details(game)}

      {celebrating && game.lastGoal && (
        <div className="nhl-goal-banner" aria-live="assertive">
          <span className="nhl-goal-word">{t('hockey.goal')}</span>
          <span className="nhl-goal-who">
            {game.lastGoal.number != null && <b>#{game.lastGoal.number}</b>} {game.lastGoal.scorer}
          </span>
        </div>
      )}
    </section>
  )

  // render helpers (plain calls, not components, so logos don't remount each tick)
  function status(game: HockeyGame, now: Date) {
    if (game.phase === 'live') {
      const p = periodLabel(game)
      const period = p ? t(p.key, p.vars) : ''
      return (
        <span className="nhl-status live">
          <i className="nhl-dot" />
          {game.intermission ? t('hockey.intermission', { period }) : t('hockey.live')}
          {!game.intermission && period && <span className="nhl-status-sub">{period}</span>}
        </span>
      )
    }
    if (game.phase === 'final') {
      const suffix = game.periodType === 'OT' ? '/OT' : game.periodType === 'SO' ? '/SO' : ''
      return <span className="nhl-status">{t('hockey.final')}{suffix}</span>
    }
    if (game.phase === 'pregame') return <span className="nhl-status soon">{t('hockey.warmups')}</span>
    return <span className="nhl-status">{game.start ? dayLabel(game.start, now) : t('hockey.nextGame')}</span>
  }

  function tag(game: HockeyGame) {
    if (game.series) {
      return <span className="nhl-tag">{t('hockey.round', { n: game.series.round ?? 1 })}{game.series.game != null && ` · ${t('hockey.gameN', { n: game.series.game })}`}</span>
    }
    if (game.gameType === 1) return <span className="nhl-tag">{t('hockey.preseason')}</span>
    return null
  }

  function center(game: HockeyGame, now: Date) {
    const showScore = game.phase === 'live' || game.phase === 'final'
    if (showScore) {
      const res = result(game)
      return (
        <div className="nhl-center">
          <div className="nhl-score">
            <span className={scoreClass(game.away, game.home)}>{game.away.score ?? 0}</span>
            <span className="nhl-dash">–</span>
            <span className={scoreClass(game.home, game.away)}>{game.home.score ?? 0}</span>
          </div>
          {game.phase === 'live' && game.timeRemaining && game.periodType !== 'SO' && (
            <span className="nhl-clock">{game.intermission ? t('hockey.intermissionLeft', { time: game.timeRemaining }) : game.timeRemaining}</span>
          )}
          {res && <span className={`nhl-result ${res === 'W' ? 'win' : 'loss'}`}>{t(res === 'W' ? 'hockey.win' : 'hockey.loss')}</span>}
        </div>
      )
    }
    const left = countdown(game.start, now)
    return (
      <div className="nhl-center">
        <span className="nhl-at">{game.home.tracked ? t('hockey.vs') : '@'}</span>
        <span className="nhl-time">{game.start ? fmtTime(game.start, locale) : '–'}</span>
        {left && <span className="nhl-countdown">{fmtCountdown(left)}</span>}
      </div>
    )
  }

  function details(game: HockeyGame) {
    if (game.phase === 'live' || (game.phase === 'final' && game.lastGoal)) {
      return (
        <div className="nhl-details">
          {game.away.sog != null && game.home.sog != null && shotsBar(game.away, game.home)}
          {game.lastGoal && lastGoal(game)}
        </div>
      )
    }
    const { us, them } = sides(game)
    const venue = us.tracked
      ? (game.home.tracked ? t('hockey.homeVs', { team: them.shortName }) : t('hockey.awayAt', { team: them.shortName }))
      : `${game.away.shortName} @ ${game.home.shortName}`
    return (
      <div className="nhl-details">
        <div className="nhl-line">
          <span className="nhl-venue">{venue}</span>
        </div>
        {game.broadcasts.length > 0 && (
          <div className="nhl-tv">
            <span className="nhl-tv-label">{t('hockey.tv')}</span>
            {game.broadcasts.map((b) => <span key={b} className="nhl-chip">{b}</span>)}
          </div>
        )}
        {game.series && seriesLine(game)}
      </div>
    )
  }

  function shotsBar(away: HockeyTeam, home: HockeyTeam) {
    const total = (away.sog ?? 0) + (home.sog ?? 0)
    const pct = total ? ((away.sog ?? 0) / total) * 100 : 50
    return (
      <div className="nhl-sog">
        <span className="nhl-sog-n">{away.sog}</span>
        <div className="nhl-sog-bar" aria-hidden="true"
          style={{ '--away': away.color, '--home': home.color, '--split': `${pct}%` } as React.CSSProperties} />
        <span className="nhl-sog-n">{home.sog}</span>
        <span className="nhl-sog-label">{t('hockey.shots')}</span>
      </div>
    )
  }

  function lastGoal(game: HockeyGame) {
    const g = game.lastGoal!
    const strength = g.strength && g.strength !== 'EVEN' && g.strength !== 'EV' ? g.strength : null
    return (
      <div className={`nhl-last${g.tracked ? ' ours' : ''}`}>
        <span className="nhl-last-label">{t('hockey.lastGoal')}{g.teamAbbrev && ` · ${g.teamAbbrev}`}</span>
        <span className="nhl-last-who">
          {g.number != null && <b className="nhl-jersey">{g.number}</b>}
          <span className="nhl-last-name">{g.scorer}{g.total != null && <small> ({g.total})</small>}</span>
          {strength && <span className="nhl-chip strong">{strength}</span>}
        </span>
        {g.assists.length > 0 && (
          <span className="nhl-assists">
            {t('hockey.assists')}: {g.assists.map((x) => `${x.name}${x.total != null ? ` (${x.total})` : ''}`).join(', ')}
          </span>
        )}
      </div>
    )
  }

  function seriesLine(game: HockeyGame) {
    const s = game.series!
    const text = s.topWins === s.bottomWins
      ? t('hockey.seriesTied', { n: s.topWins })
      : t('hockey.seriesLead', {
        team: s.topWins > s.bottomWins ? s.topSeed : s.bottomSeed,
        w: Math.max(s.topWins, s.bottomWins),
        l: Math.min(s.topWins, s.bottomWins),
      })
    return <span className="nhl-series">{text}</span>
  }

  function teamBlock(team: HockeyTeam, dark: boolean) {
    const src = dark ? team.logoDark : team.logo
    return (
      <div className={`nhl-team${team.tracked ? ' tracked' : ''}`}>
        <div className="nhl-logo">
          {src ? <img src={src} alt={team.name} draggable={false} /> : <span>{team.abbrev}</span>}
        </div>
        <span className="nhl-abbrev">{team.abbrev}</span>
        {team.record && <span className="nhl-record">{team.record}</span>}
      </div>
    )
  }

  function dayLabel(d: Date, now: Date): string {
    // the time itself is the big number in the middle
    if (isSameDay(d, now)) return d.getHours() >= 17 ? t('hockey.tonight') : t('hockey.today')
    if (isSameDay(d, addDays(now, 1))) return t('hockey.tomorrow')
    return new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'short', day: 'numeric' }).format(d)
  }

  function fmtCountdown({ days, hours, minutes }: { days: number; hours: number; minutes: number }): string {
    if (days > 0) return t('hockey.inDays', { count: days, h: hours })
    if (hours > 0) return t('hockey.inHours', { h: hours, m: String(minutes).padStart(2, '0') })
    return t('hockey.inMinutes', { m: minutes })
  }
}

const scoreClass = (a: HockeyTeam, b: HockeyTeam) =>
  `nhl-pts${a.tracked ? ' ours' : ''}${(a.score ?? 0) > (b.score ?? 0) ? ' ahead' : ''}`

/**
 * True for a few seconds after the tracked team scores. Keyed on the goal's
 * event id so a page load mid-game doesn't celebrate an old goal.
 */
function useGoalCelebration(game: HockeyGame | null): boolean {
  const seen = useRef<number | null | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [on, setOn] = useState(false)
  const loaded = !!game
  const id = game?.lastGoal?.eventId ?? null

  useEffect(() => {
    if (!loaded) return // not loaded yet: the first real state is the baseline
    if (seen.current === undefined) { seen.current = id; return }
    if (id == null || id === seen.current) return
    seen.current = id
    if (!game?.lastGoal?.tracked || game.phase !== 'live') return
    setOn(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOn(false), CELEBRATE_MS)
  }, [id, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(timer.current), [])

  return on
}
