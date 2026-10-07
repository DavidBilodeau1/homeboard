import { useCallback, useEffect, useRef } from 'react'

/** Runs only the last call per key once `delayMs` passes without another. */
export function useDebouncer(delayMs: number) {
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  return useCallback((key: string, run: () => void) => {
    clearTimeout(timers.current.get(key))
    timers.current.set(key, setTimeout(run, delayMs))
  }, [delayMs])
}
