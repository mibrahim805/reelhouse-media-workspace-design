'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

type ThemeContextValue = {
  theme: ThemePreference
  setTheme: (theme: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyTheme(theme: ThemePreference, systemLight = window.matchMedia('(prefers-color-scheme: light)').matches) {
  const root = document.documentElement
  const light = theme === 'light' || (theme === 'system' && systemLight)
  root.classList.toggle('light', light)
  root.classList.toggle('dark', !light)
  root.style.colorScheme = light ? 'light' : 'dark'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>('system')
  const [systemLight, setSystemLight] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('reelhouse.theme')
    if (stored === 'light' || stored === 'dark' || stored === 'system') setThemeState(stored)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    setSystemLight(media.matches)
    applyTheme(theme, media.matches)
    const onSystemThemeChange = (event: MediaQueryListEvent) => {
      setSystemLight(event.matches)
      if (theme === 'system') applyTheme('system', event.matches)
    }
    const onNativeThemeChange = (event: Event) => {
      const dark = Boolean((event as CustomEvent<{ dark?: boolean }>).detail?.dark)
      setSystemLight(!dark)
      if (theme === 'system') applyTheme('system', !dark)
    }
    media.addEventListener?.('change', onSystemThemeChange)
    window.addEventListener('reelhouse-system-theme', onNativeThemeChange)
    return () => { media.removeEventListener?.('change', onSystemThemeChange); window.removeEventListener('reelhouse-system-theme', onNativeThemeChange) }
  }, [theme])

  useEffect(() => { applyTheme(theme, systemLight) }, [systemLight, theme])

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next)
    localStorage.setItem('reelhouse.theme', next)
    applyTheme(next, systemLight)
  }, [systemLight])

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used within ThemeProvider')
  return value
}
