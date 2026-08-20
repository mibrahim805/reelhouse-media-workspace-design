'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

type ThemeContextValue = {
  theme: ThemePreference
  setTheme: (theme: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyTheme(theme: ThemePreference) {
  const root = document.documentElement
  const systemLight = window.matchMedia('(prefers-color-scheme: light)').matches
  const light = theme === 'light' || (theme === 'system' && systemLight)
  root.classList.toggle('light', light)
  root.classList.toggle('dark', !light)
  root.style.colorScheme = light ? 'light' : 'dark'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>('system')

  useEffect(() => {
    const stored = localStorage.getItem('reelhouse.theme')
    if (stored === 'light' || stored === 'dark' || stored === 'system') setThemeState(stored)
  }, [])

  useEffect(() => {
    applyTheme(theme)
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const onSystemThemeChange = () => {
      if (theme === 'system') applyTheme('system')
    }
    media.addEventListener?.('change', onSystemThemeChange)
    return () => media.removeEventListener?.('change', onSystemThemeChange)
  }, [theme])

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next)
    localStorage.setItem('reelhouse.theme', next)
    applyTheme(next)
  }, [])

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used within ThemeProvider')
  return value
}
