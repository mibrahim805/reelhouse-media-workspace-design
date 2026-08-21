'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
} from 'react'
import { addRecentSearch, readRecentSearches, writeRecentSearches } from '@/lib/recent-searches'

type SearchContextValue = {
  recent: string[]
  addRecent: (term: string) => void
  removeRecent: (term: string) => void
}

const SearchContext = createContext<SearchContextValue | null>(null)

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [recent, setRecent] = useState<string[]>([])

  useEffect(() => setRecent(readRecentSearches()), [])

  const addRecent = useCallback((term: string) => {
    const t = term.trim()
    if (!t) return
    setRecent(addRecentSearch(t))
  }, [])

  const removeRecent = useCallback((term: string) => {
    setRecent((prev) => {
      const next = prev.filter((r) => r.toLocaleLowerCase() !== term.toLocaleLowerCase())
      writeRecentSearches(next)
      return next
    })
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
