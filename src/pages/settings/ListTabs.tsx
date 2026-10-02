import React from 'react'
import { ListEditor } from '../../components/editor/ListEditor'
import type { CalendarCfg, ListCfg } from '../../types'
import type { TabProps } from './types'

const DEFAULT_CALENDAR_COLOR = '#c33c54'

export type ListSection = 'tasks' | 'meals' | 'lists' | 'rewards'

export function CalendarsTab({ draft, update, entities }: TabProps) {
  const rows = (draft.calendars ?? []).map((calendar) => ({ ...calendar, name: calendar.name ?? '' }))
  const toCalendar = (row: { name: string; entity: string | null; color?: string }): CalendarCfg => ({
    ...row,
    entity: row.entity ?? '',
    color: row.color ?? DEFAULT_CALENDAR_COLOR,
  })
  return (
    <ListEditor rows={rows} domains={['calendar']} options={entities} withColor
      onChange={(next) => update((d) => { d.calendars = next.map(toCalendar) })} />
  )
}

export function ListSectionTab({ section, domains, withColor, draft, update, entities }: TabProps & {
  section: ListSection
  domains: string[]
  withColor?: boolean
}) {
  return (
    <ListEditor<ListCfg> rows={draft[section] ?? []} domains={domains} options={entities} withColor={withColor}
      onChange={(rows) => update((d) => { d[section] = rows })} />
  )
}
