import { useCallback, useState } from 'react'

const STORAGE_KEY = 'homeboard-calendar-layers'

function readStoredLayers(): Record<string, boolean> {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return stored && typeof stored === 'object' ? stored : {}
  } catch {
    return {}
  }
}

/** Calendar layers shown or hidden on this screen only; unset layers use `fallback`. */
export function useCalendarLayers() {
  const [choices, setChoices] = useState<Record<string, boolean>>(readStoredLayers)

  const layerVisible = useCallback((id: string, fallback = true) => choices[id] ?? fallback, [choices])

  const toggleLayer = useCallback((id: string, fallback = true) => {
    setChoices((prev) => {
      const next = { ...prev, [id]: !(prev[id] ?? fallback) }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* private mode */ }
      return next
    })
  }, [])

  return { layerVisible, toggleLayer }
}
