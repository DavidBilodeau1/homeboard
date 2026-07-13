import React, { useState } from 'react'
import { useStore } from '../store'
import type { ListCfg } from '../types'
import { PlusIcon, TrashIcon } from '../icons'

/** Shared page for Tasks / Lists / Meals: tabbed todo lists with check/add/remove. */
export function TodoBoardPage({ title, lists }: { title: string; lists: ListCfg[] }) {
  const { todos, toggleItem, addItem, removeItem, t } = useStore()
  const usable = lists.filter((l) => l.entity)
  const [active, setActive] = useState(0)
  const [draft, setDraft] = useState('')
  const cur = usable[Math.min(active, Math.max(usable.length - 1, 0))]
  const items = cur?.entity ? todos[cur.entity] ?? [] : []
  const open = items.filter((i) => i.status !== 'completed')
  const done = items.filter((i) => i.status === 'completed')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !cur?.entity) return
    setDraft('')
    await addItem(cur.entity, text)
  }

  if (!usable.length) {
    return <div className="card page-card"><h2 className="card-title">{title}</h2><p className="cal-empty">{t('todo.noLists')}</p></div>
  }

  return (
    <div className="card page-card todo-board">
      <h2 className="card-title">{title}</h2>
      <div className="todo-tabs">
        {usable.map((l, i) => {
          const n = l.entity ? (todos[l.entity] ?? []).filter((it) => it.status !== 'completed').length : 0
          return (
            <button key={l.entity} className={`todo-tab${i === active ? ' active' : ''}`} onClick={() => setActive(i)}>
              {l.name} <em>{n}</em>
            </button>
          )
        })}
      </div>
      <form className="todo-add" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('todo.addTo', { name: cur?.name ?? '' })}
        />
        <button type="submit" aria-label={t('todo.addItem')}><PlusIcon /></button>
      </form>
      <div className="todo-items">
        {open.map((it) => (
          <div className="todo-item" key={it.uid}>
            <label>
              <input type="checkbox" checked={false} onChange={() => cur.entity && toggleItem(cur.entity, it)} />
              <span>{it.summary}</span>
            </label>
            <button className="todo-del" onClick={() => cur.entity && removeItem(cur.entity, it.uid)} aria-label={t('todo.delete')}><TrashIcon /></button>
          </div>
        ))}
        {done.length > 0 && <div className="todo-done-label">{t('todo.completed')}</div>}
        {done.map((it) => (
          <div className="todo-item done" key={it.uid}>
            <label>
              <input type="checkbox" checked onChange={() => cur.entity && toggleItem(cur.entity, it)} />
              <span>{it.summary}</span>
            </label>
            <button className="todo-del" onClick={() => cur.entity && removeItem(cur.entity, it.uid)} aria-label={t('todo.delete')}><TrashIcon /></button>
          </div>
        ))}
        {items.length === 0 && <div className="cal-empty">{t('todo.empty')}</div>}
      </div>
    </div>
  )
}
