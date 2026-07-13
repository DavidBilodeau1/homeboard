import React from 'react'
import type { Translate } from '../i18n'
import { HomeIcon } from '../icons'

export function LoginScreen({ t, error }: { t: Translate; error?: boolean }) {
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo"><HomeIcon /></div>
        <h1 className="login-title">HomeBoard</h1>
        <p className="login-sub">{t('login.subtitle')}</p>
        {error && <p className="login-error">{t('login.error')}</p>}
        <a className="login-btn" href="/auth/login">{t('login.button')}</a>
      </div>
    </div>
  )
}
