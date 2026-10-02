import React from 'react'
import { BinIcon } from '../../icons'
import { useStore } from '../../store'
import { useCollections } from './useCollections'

/** Today's and tomorrow's pickups in the header. */
export function GarbageBadges() {
  const { t } = useStore()
  const soon = useCollections().filter((c) => c.daysUntil === 0 || c.daysUntil === 1)
  return (
    <>
      {soon.map((collection) => (
        <span key={collection.name} className="tb-garbage" style={{ background: collection.color }}>
          <BinIcon size={17} />
          {collection.name} · {collection.daysUntil === 0 ? t('garbage.today') : t('garbage.tomorrow')}
        </span>
      ))}
    </>
  )
}
