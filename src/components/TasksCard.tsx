import React from 'react'
import { useStore } from '../store'

const DEFAULT_BAR_COLOR = '#A9C0F5'

export function TasksCard() {
  const { config, todos, t } = useStore()
  if (!config) return null
  return (
    <section className="card tasks-card">
      <h2 className="card-title">{t('card.tasks')}</h2>
      <div className="tasks-rows">
        {(config.tasks ?? []).map((task) => {
          const items = task.entity ? todos[task.entity] ?? [] : []
          const total = items.length
          const done = items.filter((i) => i.status === 'completed').length
          const pct = total ? (done / total) * 100 : 0
          return (
            <div className="task-row" key={task.name}>
              <span className="task-name">{task.name}</span>
              <span className="task-right">
                <span className="task-count">{done}/{total}</span>
                <span className="task-bar">
                  <span style={{ width: `${pct}%`, background: task.color ?? DEFAULT_BAR_COLOR }} />
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
