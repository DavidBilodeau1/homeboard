import React from 'react'
import { Note } from '../../components/editor/Field'
import { ListEditor, type EditorRow } from '../../components/editor/ListEditor'
import { useStore } from '../../store'
import type { SettingsPanelProps } from '../types'
import { DEFAULT_COLOR, type GarbageSettings } from './collections'

export function GarbageSettingsPanel({ settings, onChange, entities }: SettingsPanelProps<GarbageSettings>) {
  const { t } = useStore()
  return (
    <div className="ed-fields">
      <Note>{t('garbage.settings.hint')}</Note>
      <ListEditor<EditorRow> rows={settings.collections ?? []} domains={['sensor']} options={entities} withColor
        onChange={(rows) => onChange({ ...settings, collections: rows.map((row) => ({ ...row, color: row.color ?? DEFAULT_COLOR })) })} />
    </div>
  )
}
