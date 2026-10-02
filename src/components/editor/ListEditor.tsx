import React from 'react'
import { useStore } from '../../store'
import { EntitySelect } from './EntitySelect'
import type { EntityOption } from './useEntityOptions'

export interface EditorRow {
  name: string
  entity: string | null
  color?: string
  icon?: string
}

const DEFAULT_COLOR = '#c33c54'

interface Props<R extends EditorRow> {
  rows: R[]
  onChange: (rows: R[]) => void
  domains: string[]
  options: EntityOption[]
  withColor?: boolean
  /** icon choices for each row; omitted for rows without icons */
  icons?: string[]
}

const moved = <T,>(items: T[], from: number, to: number) => {
  const next = [...items]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

/** Editable rows of `{ name, entity }`: add, remove, reorder. */
export function ListEditor<R extends EditorRow>({ rows, onChange, domains, options, withColor, icons }: Props<R>) {
  const { t } = useStore()
  const patch = (i: number, change: Partial<EditorRow>) => onChange(rows.map((row, j) => (j === i ? { ...row, ...change } : row)))
  const move = (i: number, step: -1 | 1) => {
    const j = i + step
    if (j >= 0 && j < rows.length) onChange(moved(rows, i, j))
  }

  return (
    <div className="ed-rows">
      {rows.map((row, i) => (
        <div className="ed-row" key={i}>
          <input className="ed-input" value={row.name} placeholder={t('settings.name')}
            onChange={(e) => patch(i, { name: e.target.value })} />
          <EntitySelect value={row.entity} domains={domains} options={options} onChange={(entity) => patch(i, { entity })} />
          {withColor && (
            <input type="color" className="ed-color" value={row.color ?? DEFAULT_COLOR} title={t('settings.color')}
              onChange={(e) => patch(i, { color: e.target.value })} />
          )}
          {icons && (
            <select className="ed-select ed-icon" value={row.icon ?? icons[0]} title={t('settings.icon')}
              onChange={(e) => patch(i, { icon: e.target.value })}>
              {icons.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
            </select>
          )}
          <span className="ed-row-btns">
            <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('settings.up')}>↑</button>
            <button onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={t('settings.down')}>↓</button>
            <button className="ed-del" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={t('settings.remove')}>✕</button>
          </span>
        </div>
      ))}
      <button className="ed-add" onClick={() => onChange([...rows, { name: '', entity: null } as R])}>+ {t('settings.add')}</button>
    </div>
  )
}
