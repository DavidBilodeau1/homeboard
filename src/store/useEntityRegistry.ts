import { useCallback, useRef, useState } from 'react'
import * as api from '../api'
import type { EntityState } from '../types'

export type EntityStates = Record<string, EntityState | null>

/** Entity states components ask for; `track` is reference counted, so an entity stays live while anything shows it. */
export function useEntityRegistry() {
  const [states, setStates] = useState<EntityStates>({})
  const counts = useRef(new Map<string, number>())

  const refresh = useCallback(async (ids: string[]) => {
    if (!ids.length) return
    const results = await Promise.all(ids.map(api.getState))
    setStates((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id, i) => [id, results[i]])) }))
  }, [])

  const track = useCallback((ids: string[]) => {
    const unique = [...new Set(ids.filter(Boolean))]
    const added = unique.filter((id) => !counts.current.has(id))
    for (const id of unique) counts.current.set(id, (counts.current.get(id) ?? 0) + 1)
    refresh(added)
    return () => {
      for (const id of unique) {
        const remaining = (counts.current.get(id) ?? 1) - 1
        if (remaining > 0) counts.current.set(id, remaining)
        else counts.current.delete(id)
      }
    }
  }, [refresh])

  const isTracked = useCallback((id: string) => counts.current.has(id), [])

  const refreshAll = useCallback(() => refresh([...counts.current.keys()]), [refresh])

  /** Shows a state before HA confirms it, so taps feel instant. */
  const setOptimistic = useCallback((id: string, state: string) => {
    setStates((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id]!, state } } : prev))
  }, [])

  return { states, track, isTracked, refresh, refreshAll, setOptimistic }
}
