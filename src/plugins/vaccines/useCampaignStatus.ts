import { useEffect, useState } from 'react'
import { getJson, pluginUrl } from '../../api'
import type { CampaignStatus } from './types'

/** The server only asks the sources every two hours; this just picks up its answer. */
const POLL_MS = 30 * 60_000

export const SOURCE_NAMES: Record<string, string> = { clicSante: 'Clic Santé', quebec: 'Québec.ca' }

export function useCampaignStatus(): CampaignStatus | null {
  const [status, setStatus] = useState<CampaignStatus | null>(null)
  useEffect(() => {
    const load = () => getJson<CampaignStatus>(pluginUrl('vaccines', 'status')).then(setStatus, () => {})
    load()
    const timer = setInterval(load, POLL_MS)
    return () => clearInterval(timer)
  }, [])
  return status
}
