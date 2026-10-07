import React from 'react'
import { Field, Note } from '../../components/editor/Field'
import { useStore } from '../../store'
import type { PluginSettings } from '../../types'
import type { SettingsPanelProps } from '../types'

export interface ImmichSettings extends PluginSettings {
  album?: string
}

export function ImmichSettingsPanel({ settings, onChange }: SettingsPanelProps<ImmichSettings>) {
  const { t } = useStore()
  return (
    <div className="ed-fields">
      <Note>{t('immich.settings.hint')}</Note>
      <Field label={t('immich.settings.album')}>
        <input className="ed-input" value={settings.album ?? ''} onChange={(e) => onChange({ ...settings, album: e.target.value || undefined })} />
      </Field>
    </div>
  )
}
