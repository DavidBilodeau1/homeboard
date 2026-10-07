import React from 'react'
import { EntitySelect } from '../../components/editor/EntitySelect'
import { Field, Note } from '../../components/editor/Field'
import { useStore } from '../../store'
import type { SettingsPanelProps } from '../types'
import { NHL_TEAMS } from './game'
import type { HockeySettings } from './types'

export function HockeySettingsPanel({ settings, onChange, entities }: SettingsPanelProps<HockeySettings>) {
  const { t } = useStore()
  return (
    <div className="ed-fields">
      <Note>{t('hockey.settings.hint')}</Note>
      <Field label={t('hockey.settings.entity')}>
        <EntitySelect value={settings.entity} domains={['sensor']} options={entities}
          onChange={(entity) => onChange({ ...settings, entity: entity ?? undefined })} />
      </Field>
      <Field label={t('hockey.settings.team')}>
        <select className="ed-select" value={settings.team ?? ''} onChange={(e) => onChange({ ...settings, team: e.target.value || undefined })}>
          <option value="">{t('hockey.settings.teamAuto')}</option>
          {Object.entries(NHL_TEAMS).map(([abbrev, team]) => <option key={abbrev} value={abbrev}>{abbrev} · {team.nick}</option>)}
        </select>
      </Field>
    </div>
  )
}
