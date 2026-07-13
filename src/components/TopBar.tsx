import React, { useState } from 'react'
import { useStore } from '../store'
import { fmtTime, fmtTopDate } from '../util'
import { WeatherIcon, WifiIcon, ChevronDown, MoonIcon, SunIcon, MenuIcon, BinIcon } from '../icons'

const AVATAR_COLORS = ['#E58BA0', '#8BAAE5', '#8BD0A0', '#E5C08B', '#B79BE0']

type Menu = 'people' | 'wifi' | null

export function TopBar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { now, locale, t, weather, forecast, connected, config, systemInfo, persons, garbage, resolvedTheme, setThemeMode } = useStore()
  const [menu, setMenu] = useState<Menu>(null)

  const today = forecast[0]
  const hi = today ? Math.round(today.temperature) : weather?.temperature != null ? Math.round(weather.temperature) : null
  const lo = today ? Math.round(today.templow) : null
  const unit = weather?.unit ?? '°'

  // prefer the configured people (by name), matched to their HA person entity for
  // live status; fall back to all HA persons when no people are configured
  const configNames = config?.people ?? []
  const people = configNames.length
    ? configNames.map((name) => ({
        name,
        state: persons.find((p) => p.name.toLowerCase() === name.toLowerCase())?.state,
      }))
    : persons.map((p) => ({ name: p.name, state: p.state }))

  const statusKind = (s?: string) => (s === 'home' ? 'home' : s === 'not_home' ? 'away' : 'unknown')
  const statusLabel = (s?: string) =>
    s === 'home' ? t('status.home') : s === 'not_home' ? t('status.away') : '—'

  const toggle = (m: Menu) => setMenu((cur) => (cur === m ? null : m))

  return (
    <header className="topbar">
      <button className="tb-menu" aria-label="Menu" onClick={onToggleSidebar}><MenuIcon /></button>
      <span className="tb-date">{fmtTopDate(now, locale)}</span>
      <span className="tb-time">{fmtTime(now, locale)}</span>
      {weather && (
        <span className="tb-weather">
          <WeatherIcon condition={weather.state} size={26} />
          <span>{hi != null ? (lo != null ? `${hi}/${lo}${unit}` : `${hi}${unit}`) : '--'}</span>
        </span>
      )}
      {garbage
        .filter((g) => g.daysUntil === 0 || g.daysUntil === 1)
        .map((g) => (
          <span key={g.name} className="tb-garbage" style={{ background: g.color }}>
            <BinIcon size={17} />
            {g.name} · {g.daysUntil === 0 ? t('garbage.today') : t('garbage.tomorrow')}
          </span>
        ))}
      <div className="tb-right">
        <div className="tb-menu-wrap">
          <button className="tb-avatars" onClick={() => toggle('people')} aria-label={t('topbar.people')}>
            {people.slice(0, 4).map((p, i) => (
              <span
                key={p.name + i}
                className={`tb-avatar st-${statusKind(p.state)}`}
                style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
              >
                {p.name.charAt(0).toUpperCase()}
              </span>
            ))}
            <span className="tb-caret"><ChevronDown /></span>
          </button>
          {menu === 'people' && (
            <div className="tb-dropdown">
              <div className="tb-dd-title">{t('topbar.people')}</div>
              {people.length === 0 && <div className="tb-dd-empty">—</div>}
              {people.map((p, i) => (
                <div className="tb-dd-row" key={p.name + i}>
                  <span className="tb-avatar sm" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="tb-dd-name">{p.name}</span>
                  <span className={`tb-status st-${statusKind(p.state)}`}>
                    <i className="tb-status-dot" />{statusLabel(p.state)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          className="tb-theme"
          title={resolvedTheme === 'dark' ? t('topbar.toLight') : t('topbar.toDark')}
          onClick={() => setThemeMode(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
          {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>

        <div className="tb-menu-wrap">
          <button
            className={`tb-wifi${connected ? '' : ' off'}`}
            onClick={() => toggle('wifi')}
            aria-label={t('topbar.connection')}
          >
            <WifiIcon />
          </button>
          {menu === 'wifi' && (
            <div className="tb-dropdown">
              <div className="tb-dd-title">{t('settings.ha')}</div>
              <div className="tb-dd-row">
                <span className={`tb-status st-${connected ? 'home' : 'away'}`}>
                  <i className="tb-status-dot" />{connected ? t('settings.connected') : t('settings.disconnected')}
                </span>
              </div>
              {systemInfo?.location_name && (
                <div className="tb-dd-info"><span>{t('settings.location')}</span><b>{systemInfo.location_name}</b></div>
              )}
              {systemInfo?.version && (
                <div className="tb-dd-info"><span>{t('settings.haVersion')}</span><b>{systemInfo.version}</b></div>
              )}
            </div>
          )}
        </div>
      </div>

      {menu && <div className="tb-scrim" onClick={() => setMenu(null)} />}
    </header>
  )
}
