'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
} from 'react'

type SearchContextValue = {
  recent: string[]
  addRecent: (term: string) => void
  removeRecent: (term: string) => void
}

const SearchContext = createContext<SearchContextValue | null>(null)

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [recent, setRecent] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = window.localStorage.getItem('reelhouse.recent-searches')
      return saved ? JSON.parse(saved).slice(0, 8) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem('reelhouse.recent-searches', JSON.stringify(recent))
    } catch {
      // Private browsing and embedded WebViews may disable storage.
    }
  }, [recent])

  const addRecent = useCallback((term: string) => {
    const t = term.trim()
    if (!t) return
    setRecent((prev) => [t, ...prev.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, 8))
  }, [])

  const removeRecent = useCallback((term: string) => {
    setRecent((prev) => prev.filter((r) => r !== term))
  }, [])

  const value = useMemo(
    () => ({ recent, addRecent, removeRecent }),
    [recent, addRecent, removeRecent],
  )

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
}

export function useSearch() {
  const ctx = useContext(SearchContext)
  if (!ctx) throw new Error('useSearch must be used within a SearchProvider')
  return ctx
}
