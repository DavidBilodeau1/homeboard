import React, { useState } from 'react'
import { useActivePlugins } from '../plugins/active'
import { useStore } from '../store'
import { fmtTime, fmtTopDate } from '../util'
import { ChevronDown, MenuIcon, MoonIcon, SunIcon, WeatherIcon, WifiIcon } from '../icons'

const AVATAR_COLORS = ['#E58BA0', '#8BAAE5', '#8BD0A0', '#E5C08B', '#B79BE0']
const AVATARS_SHOWN = 4

type Menu = 'people' | 'connection' | null

interface Person {
  name: string
  state?: string
}

const presence = (state?: string) => (state === 'home' ? 'home' : state === 'not_home' ? 'away' : 'unknown')

const avatarColor = (i: number) => AVATAR_COLORS[i % AVATAR_COLORS.length]

/** Configured people matched to their HA person by name, else every HA person. */
function usePeople(): Person[] {
  const { config, persons } = useStore()
  const names = config?.people ?? []
  if (!names.length) return persons.map((p) => ({ name: p.name, state: p.state }))
  return names.map((name) => ({ name, state: persons.find((p) => p.name.toLowerCase() === name.toLowerCase())?.state }))
}

function Avatar({ person, index, small }: { person: Person; index: number; small?: boolean }) {
  return (
    <span className={`tb-avatar${small ? ' sm' : ` st-${presence(person.state)}`}`} style={{ background: avatarColor(index) }}>
      {person.name.charAt(0).toUpperCase()}
    </span>
  )
}

function PeopleMenu({ people }: { people: Person[] }) {
  const { t } = useStore()
  const label = (state?: string) => ({ home: t('status.home'), away: t('status.away'), unknown: '—' })[presence(state)]
  return (
    <div className="tb-dropdown">
      <div className="tb-dd-title">{t('topbar.people')}</div>
      {people.length === 0 && <div className="tb-dd-empty">—</div>}
      {people.map((person, i) => (
        <div className="tb-dd-row" key={person.name + i}>
          <Avatar person={person} index={i} small />
          <span className="tb-dd-name">{person.name}</span>
          <span className={`tb-status st-${presence(person.state)}`}><i className="tb-status-dot" />{label(person.state)}</span>
        </div>
      ))}
    </div>
  )
}

function ConnectionMenu() {
  const { connected, systemInfo, t } = useStore()
  return (
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
  )
}

function WeatherSummary() {
  const { weather, forecast } = useStore()
  if (!weather) return null
  const today = forecast[0]
  const high = today ? Math.round(today.temperature) : weather.temperature != null ? Math.round(weather.temperature) : null
  const low = today ? Math.round(today.templow) : null
  const text = high == null ? '--' : low == null ? `${high}${weather.unit}` : `${high}/${low}${weather.unit}`
  return (
    <span className="tb-weather">
      <WeatherIcon condition={weather.state} size={26} />
      <span>{text}</span>
    </span>
  )
}

export function TopBar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { now, locale, t, connected, resolvedTheme, setThemeMode } = useStore()
  const plugins = useActivePlugins()
  const people = usePeople()
  const [menu, setMenu] = useState<Menu>(null)
  const toggle = (next: Menu) => setMenu((current) => (current === next ? null : next))
  const dark = resolvedTheme === 'dark'

  return (
    <header className="topbar">
      <button className="tb-menu" aria-label="Menu" onClick={onToggleSidebar}><MenuIcon /></button>
      <span className="tb-date">{fmtTopDate(now, locale)}</span>
      <span className="tb-time">{fmtTime(now, locale)}</span>
      <WeatherSummary />
      {plugins.map(({ id, TopBarItem }) => TopBarItem && <TopBarItem key={id} />)}
      <div className="tb-right">
        <div className="tb-menu-wrap">
          <button className="tb-avatars" onClick={() => toggle('people')} aria-label={t('topbar.people')}>
            {people.slice(0, AVATARS_SHOWN).map((person, i) => <Avatar key={person.name + i} person={person} index={i} />)}
            <span className="tb-caret"><ChevronDown /></span>
          </button>
          {menu === 'people' && <PeopleMenu people={people} />}
        </div>

        <button className="tb-theme" title={dark ? t('topbar.toLight') : t('topbar.toDark')} onClick={() => setThemeMode(dark ? 'light' : 'dark')}>
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>

        <div className="tb-menu-wrap">
          <button className={`tb-wifi${connected ? '' : ' off'}`} onClick={() => toggle('connection')} aria-label={t('topbar.connection')}>
            <WifiIcon />
          </button>
          {menu === 'connection' && <ConnectionMenu />}
        </div>
      </div>

      {menu && <div className="tb-scrim" onClick={() => setMenu(null)} />}
    </header>
  )
}
