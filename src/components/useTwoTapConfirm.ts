import { useCallback, useEffect, useRef, useState } from 'react'

const CONFIRM_WINDOW_MS = 3000

/** For risky taps (locks, alarms): the first tap arms `key`, a second one within the window runs the action. */
export function useTwoTapConfirm() {
  const [armed, setArmed] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])

  const confirm = useCallback((key: string, run: () => void) => {
    clearTimeout(timer.current)
    if (armed === key) {
      setArmed(null)
      run()
      return
    }
    setArmed(key)
    timer.current = setTimeout(() => setArmed(null), CONFIRM_WINDOW_MS)
  }, [armed])

  return { armed, confirm }
}
