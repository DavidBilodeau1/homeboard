import React from 'react'
import { useStore } from '../store'

const PALETTE = ['#FCE7EC', '#E1F5E4', '#DFF2E9', '#E4E9FB']

export function MealsCard({ onOpen }: { onOpen?: () => void }) {
  const { config, todos, t } = useStore()
  if (!config) return null
  return (
    <section className="card meals-card">
      <h2 className="card-title">{t('card.meals')}</h2>
      <div className="meal-lists">
        {config.meals.map((m, i) => {
          const items = (m.entity ? todos[m.entity] ?? [] : []).filter((it) => it.status !== 'completed')
          return (
            <div
              className="meal-group"
              key={m.name}
              style={{ '--row-color': m.color ?? PALETTE[i % PALETTE.length] } as React.CSSProperties}
            >
              <button className="meal-group-head" onClick={onOpen}>
                <span className="meal-name">{m.name}</span>
                <span className="meal-count">{t('items', { count: items.length })}</span>
              </button>
              <ul className="meal-items">
                {items.length === 0 && <li className="meal-empty">{t('meals.empty')}</li>}
                {items.map((it) => <li key={it.uid}>{it.summary}</li>)}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
