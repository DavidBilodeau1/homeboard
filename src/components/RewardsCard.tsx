import React from 'react'
import { useStore } from '../store'
import { StarIcon } from '../icons'

export function RewardsCard() {
  const { config, rewardValues, t } = useStore()
  if (!config) return null
  return (
    <section className="card rewards-card">
      <h2 className="card-title">{t('card.reward')}</h2>
      <div className="reward-rows">
        {config.rewards.map((r) => {
          const v = r.entity ? rewardValues[r.entity] : null
          return (
            <div className="reward-row" key={r.name}>
              <span className="reward-name">{r.name}</span>
              <span className="reward-right">
                <span className="reward-star"><StarIcon filled size={17} /></span>
                <span className="reward-count">{v ?? '–'}</span>
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
