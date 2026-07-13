import React from 'react'
import { useStore } from '../store'

export function TasksCard() {
  const { config, todos, t } = useStore()
  if (!config) return null
  return (
    <section className="card tasks-card">
      <h2 className="card-title">{t('card.tasks')}</h2>
      <div className="tasks-rows">
        {config.tasks.map((t) => {
          const items = t.entity ? todos[t.entity] ?? [] : []
          const total = items.length
          const done = items.filter((i) => i.status === 'completed').length
          const pct = total ? (done / total) * 100 : 0
          return (
            <div className="task-row" key={t.name}>
              <span className="task-name">{t.name}</span>
              <span className="task-right">
                <span className="task-count">{done}/{total}</span>
                <span className="task-bar">
                  <span style={{ width: `${pct}%`, background: t.color ?? '#A9C0F5' }} />
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
