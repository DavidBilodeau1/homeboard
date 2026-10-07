import React from 'react'
import { useStore } from '../../store'
import { inDomains, type EntityOption } from './useEntityOptions'

interface Props {
  value: string | null | undefined
  onChange: (entity: string | null) => void
  domains: string[]
  options: EntityOption[]
  disabled?: boolean
}

/** Entity dropdown limited to some domains; keeps a configured value HA no longer reports. */
export function EntitySelect({ value, onChange, domains, options, disabled }: Props) {
  const { t } = useStore()
  const choices = inDomains(options, domains)
  const unknown = value && !choices.some((option) => option.id === value)
  return (
    <select className="ed-select" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{t('settings.none')}</option>
      {unknown && <option value={value}>{value}</option>}
      {choices.map((option) => <option key={option.id} value={option.id}>{option.name} ({option.id})</option>)}
    </select>
  )
}
