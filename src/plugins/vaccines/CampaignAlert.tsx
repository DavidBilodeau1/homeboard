import React from 'react'
import { CloseIcon, SyringeIcon } from '../../icons'
import { useStore } from '../../store'
import { usePluginSettings } from '../settings'
import type { VaccineSettings } from './types'
import { SOURCE_NAMES, useCampaignStatus } from './useCampaignStatus'

/** Header alert once the campaign opens; dismissing it hides it on every screen until next season. */
export function CampaignAlert() {
  const { t, savePluginSettings } = useStore()
  const settings = usePluginSettings<VaccineSettings>('vaccines')
  const status = useCampaignStatus()
  if (!status) return null

  const showAlert = status.open && settings.dismissedSeason !== status.season
  const dismissed: VaccineSettings = { ...settings, dismissedSeason: status.season }
  return (
    <>
      {showAlert && (
        <span className="tb-vaccine">
          <SyringeIcon size={18} />
          {t('vaccines.campaignOpen')}
          <button className="tb-vaccine-close" aria-label={t('vaccines.dismiss')} onClick={() => savePluginSettings('vaccines', dismissed)}>
            <CloseIcon size={15} />
          </button>
        </span>
      )}
      {status.failing.length > 0 && (
        <span className="tb-vaccine-failing" title={status.failing.map((name) => SOURCE_NAMES[name] ?? name).join(', ')}>
          <SyringeIcon size={16} />
          {t('vaccines.checkFailing')}
        </span>
      )}
    </>
  )
}
