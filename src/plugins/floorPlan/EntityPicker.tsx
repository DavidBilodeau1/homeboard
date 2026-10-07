import React, { useState } from 'react'
import { useEntityOptions } from '../../components/editor/useEntityOptions'
import { useStore } from '../../store'
import { DeviceIcon } from './DeviceIcon'

const MAX_RESULTS = 200

/** Searchable list of every HA entity, to place one on the plan. */
export function EntityPicker({ onPick, onClose }: { onPick: (entity: string) => void; onClose: () => void }) {
  const { t, entityStates } = useStore()
  const options = useEntityOptions()
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const matches = options.filter((o) => !needle || o.name.toLowerCase().includes(needle) || o.id.toLowerCase().includes(needle))

  return (
    <div className="fp-picker-backdrop" onClick={onClose}>
      <div className="card fp-picker" onClick={(e) => e.stopPropagation()}>
        <h2 className="card-title">{t('floorplan.addDevice')}</h2>
        <input className="fp-picker-search" autoFocus placeholder={t('floorplan.searchEntities')}
          value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="fp-picker-list">
          {matches.length === 0 && <div className="fp-picker-empty">{t('floorplan.noEntities')}</div>}
          {matches.slice(0, MAX_RESULTS).map((option) => (
            <button key={option.id} className="fp-picker-item" onClick={() => onPick(option.id)}>
              <span className="fp-picker-icon"><DeviceIcon entity={option.id} state={entityStates[option.id]} /></span>
              <span className="fp-picker-name">{option.name}</span>
              <span className="fp-picker-id">{option.id}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
