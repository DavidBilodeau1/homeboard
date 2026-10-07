import React from 'react'
import { Field, Note } from '../../components/editor/Field'
import { useStore } from '../../store'
import { fmtTime } from '../../util'
import type { SettingsPanelProps } from '../types'
import type { SourceResult, VaccineSettings } from './types'
import { SOURCE_NAMES, useCampaignStatus } from './useCampaignStatus'

export function VaccineSettingsPanel({ settings, onChange }: SettingsPanelProps<VaccineSettings>) {
  const { t, locale } = useStore()
  const status = useCampaignStatus()
  const describe = (result: SourceResult) =>
    [t(`vaccines.state.${result.state}`), result.flag, result.error].filter(Boolean).join(' · ')

  return (
    <div className="ed-fields">
      <Note>{t('vaccines.settings.hint')}</Note>
      {status && Object.entries(status.sources).map(([name, result]) => (
        <Field key={name} label={SOURCE_NAMES[name] ?? name}>
          <span className="vaccine-source">{describe(result)}</span>
        </Field>
      ))}
      {status && <Note>{t('vaccines.settings.checkedAt', { time: fmtTime(new Date(status.checkedAt), locale) })}</Note>}
      {settings.dismissedSeason && (
        <button className="ed-revert" onClick={() => onChange({ ...settings, dismissedSeason: undefined })}>
          {t('vaccines.settings.showAgain')}
        </button>
      )}
    </div>
  )
}
