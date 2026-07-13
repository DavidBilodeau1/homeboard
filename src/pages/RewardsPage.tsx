import React from 'react'
import { useStore } from '../store'
import { StarIcon } from '../icons'

export function RewardsPage() {
  const { config, rewardValues, adjustReward, t } = useStore()
  return (
    <div className="rewards-page">
      {config?.rewards.map((r) => {
        const v = r.entity ? rewardValues[r.entity] : null
        const live = r.entity != null && v != null
        return (
          <div className="card reward-big" key={r.name}>
            <div className="reward-big-name">{r.name}</div>
            <div className="reward-big-star"><StarIcon filled size={44} /></div>
            <div className="reward-big-count">{v ?? '–'}</div>
            {live ? (
              <div className="reward-big-actions">
                <button onClick={() => adjustReward(r.entity!, 'decrement')}>−</button>
                <button onClick={() => adjustReward(r.entity!, 'increment')}>+</button>
              </div>
            ) : (
              <div className="reward-hint">{t('rewards.hint')}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
