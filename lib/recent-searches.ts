const RECENT_SEARCHES_KEY = 'rh.recent-searches'
export const MAX_RECENT_SEARCHES = 8

export function normalizeRecentSearches(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value
    .map(item => typeof item === 'string' ? item.trim() : '')
    .filter(item => {
      const key = item.toLocaleLowerCase()
      if (!item || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_RECENT_SEARCHES)
}

export function readRecentSearches(): string[] {
  if (typeof window === 'undefined') return []
  try {
    return normalizeRecentSearches(JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY) || '[]'))
  } catch {
    return []
  }
}

export function writeRecentSearches(searches: string[]) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(normalizeRecentSearches(searches))) } catch { /* persistence is optional */ }
}

export function addRecentSearch(query: string): string[] {
  const term = query.trim()
  if (!term) return readRecentSearches()
  const next = normalizeRecentSearches([term, ...readRecentSearches()])
  writeRecentSearches(next)
  return next
}
