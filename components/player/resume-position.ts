const RESUME_POSITION_KEY = 'reelhouse.resume-position'

type SavedPosition = {
  sourceKey: string
  position: number
}

export function saveResumePosition(sourceKey: string, position: number) {
  if (typeof window === 'undefined') return
  try {
    if (!Number.isFinite(position) || position <= 0) {
      const saved = readSavedPosition()
      if (saved?.sourceKey === sourceKey) window.sessionStorage.removeItem(RESUME_POSITION_KEY)
      return
    }
    window.sessionStorage.setItem(RESUME_POSITION_KEY, JSON.stringify({ sourceKey, position } satisfies SavedPosition))
  } catch {
    // Session storage is optional.
  }
}

export function readResumePosition(sourceKey: string) {
  if (typeof window === 'undefined') return 0
  try {
    const saved = readSavedPosition()
    return saved?.sourceKey === sourceKey && Number.isFinite(saved.position) ? Math.max(0, saved.position) : 0
  } catch {
    return 0
  }
}

export function clearResumePosition(sourceKey: string) {
  if (typeof window === 'undefined') return
  try {
    const saved = readSavedPosition()
    if (saved?.sourceKey === sourceKey) window.sessionStorage.removeItem(RESUME_POSITION_KEY)
  } catch {
    // Session storage is optional.
  }
}

function readSavedPosition(): SavedPosition | null {
  if (typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(RESUME_POSITION_KEY)
  if (!raw) return null
  const saved = JSON.parse(raw) as Partial<SavedPosition>
  if (typeof saved.sourceKey !== 'string' || typeof saved.position !== 'number') return null
  return saved as SavedPosition
}
