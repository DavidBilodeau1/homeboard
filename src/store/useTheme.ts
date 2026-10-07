import { useCallback, useEffect, useState } from 'react'
import type { ThemeMode } from '../types'

const STORAGE_KEY = 'homeboard-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

const storedMode = () => localStorage.getItem(STORAGE_KEY) as ThemeMode | null

function useOsDark() {
  const [dark, setDark] = useState(() => window.matchMedia(DARK_QUERY).matches)
  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY)
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return dark
}

/** A choice made on this device wins over the config default. */
export function useTheme(configMode: ThemeMode | undefined, sunBelowHorizon: boolean) {
  const [themeMode, setMode] = useState<ThemeMode>(() => storedMode() ?? 'auto')
  const osDark = useOsDark()

  useEffect(() => {
    if (configMode && !storedMode()) setMode(configMode)
  }, [configMode])

  const setThemeMode = useCallback((mode: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, mode)
    setMode(mode)
  }, [])

  const darkByMode: Record<ThemeMode, boolean> = { light: false, dark: true, sun: sunBelowHorizon, auto: osDark }
  const resolvedTheme: 'light' | 'dark' = darkByMode[themeMode] ? 'dark' : 'light'

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
  }, [resolvedTheme])

  return { themeMode, resolvedTheme, setThemeMode }
}
