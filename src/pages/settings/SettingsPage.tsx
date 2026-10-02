import React from 'react'
import { useStore } from '../../store'
import { ConfigEditor } from './ConfigEditor'
import { THEME_OPTIONS } from './GeneralTab'

function ThemeRow() {
  const { themeMode, setThemeMode, t } = useStore()
  return (
    <div className="settings-row">
      <span>{t('settings.theme')}</span>
      <span className="theme-picker">
        {THEME_OPTIONS.map((option) => (
          <button key={option.id} className={themeMode === option.id ? 'active' : ''} onClick={() => setThemeMode(option.id)}>
            {t(option.labelKey)}
          </button>
        ))}
      </span>
    </div>
  )
}

function ConnectionRow() {
  const { connected, systemInfo, t } = useStore()
  return (
    <div className="settings-row">
      <span>{t('settings.ha')}</span>
      <b className={connected ? 'ok' : 'bad'}>
        {connected ? t('settings.connected') : t('settings.disconnected')}
        {systemInfo && ` — ${systemInfo.location_name} (${systemInfo.version})`}
      </b>
    </div>
  )
}

function AccountRow() {
  const { t } = useStore()
  const logout = async () => {
    await fetch('/auth/logout', { method: 'POST' }).catch(() => {})
    location.href = '/'
  }
  return (
    <div className="settings-row">
      <span>{t('settings.account')}</span>
      <button className="settings-logout" onClick={logout}>{t('settings.logout')}</button>
    </div>
  )
}

export function SettingsPage() {
  const { meta, t } = useStore()
  return (
    <div className="card page-card settings-page">
      <h2 className="card-title">{t('settings.title')}</h2>
      <ThemeRow />
      <ConnectionRow />
      {meta?.authEnabled && <AccountRow />}
      {meta?.editorEnabled ? <ConfigEditor /> : <p className="settings-note">{t('settings.readOnly')}</p>}
    </div>
  )
}
