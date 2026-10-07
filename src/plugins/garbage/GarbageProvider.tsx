import React, { useMemo, type ReactNode } from 'react'
import { useCalendarEventSource } from '../../store'
import { LAYER_ID, toCalendarEvents } from './collections'
import { useCollections } from './useCollections'

/** Puts pickup days on every calendar view while the plugin is active. */
export function GarbageProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const collections = useCollections(active)
  const events = useMemo(() => toCalendarEvents(collections), [collections])
  useCalendarEventSource(LAYER_ID, events)
  return <>{children}</>
}
