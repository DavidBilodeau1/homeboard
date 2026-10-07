import React from 'react'
import { EntitySelect } from '../../components/editor/EntitySelect'
import { Field, Note, NumberField } from '../../components/editor/Field'
import { useStore } from '../../store'
import type { SettingsPanelProps } from '../types'
import { DEFAULT_SAFE_MAX, type AirQualitySettings } from './useAirQuality'

export function AirQualitySettingsPanel({ settings, onChange, entities }: SettingsPanelProps<AirQualitySettings>) {
  const { t } = useStore()
  const set = (change: Partial<AirQualitySettings>) => onChange({ ...settings, ...change })
  return (
    <div className="ed-fields">
      <Note>{t('air.settings.hint')}</Note>
      <Field label={t('air.settings.entity')}>
        <EntitySelect value={settings.entity} domains={['sensor']} options={entities} onChange={(entity) => set({ entity: entity ?? undefined })} />
      </Field>
      <Field label={t('air.settings.name')}>
        <input className="ed-input" value={settings.name ?? ''} placeholder={t('air.title')} onChange={(e) => set({ name: e.target.value || undefined })} />
      </Field>
      <NumberField label={t('air.settings.threshold')} min={0} value={settings.safeMax} fallback={DEFAULT_SAFE_MAX}
        onChange={(safeMax) => set({ safeMax })} />
    </div>
  )
}
