import { useEffect, useState } from 'react'
import { getAllStates } from '../../api'

export interface EntityOption {
  id: string
  name: string
}

/** Every HA entity, by friendly name, for the settings dropdowns. */
export function useEntityOptions(): EntityOption[] {
  const [options, setOptions] = useState<EntityOption[]>([])
  useEffect(() => {
    getAllStates().then((states) => setOptions(states
      .map((s) => ({ id: s.entity_id, name: String(s.attributes.friendly_name ?? s.entity_id) }))
      .sort((a, b) => a.name.localeCompare(b.name))))
  }, [])
  return options
}

export const inDomains = (options: EntityOption[], domains: string[]) =>
  options.filter((option) => domains.some((domain) => option.id.startsWith(`${domain}.`)))
