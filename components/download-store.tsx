'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

export type DownloadStatus = 'queued' | 'downloading' | 'completed' | 'failed'

export type DownloadItem = {
  id: string
  title: string
  channel: string
  thumbnail: string
  quality: string
  size: string
  source: string
  status: DownloadStatus
  progress: number
  startedAt: number
}

type StartInput = {
  title: string
  channel: string
  thumbnail: string
  quality: string
  size: string
  source: string
}

type DownloadContextValue = {
  downloads: DownloadItem[]
  activeCount: number
  completedCount: number
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
  startDownload: (input: StartInput) => void
  removeDownload: (id: string) => void
  retryDownload: (id: string) => void
  clearCompleted: () => void
}

const DownloadContext = createContext<DownloadContextValue | null>(null)

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [downloads, setDownloads] = useState<DownloadItem[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const timers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  const runProgress = useCallback((id: string) => {
    const existing = timers.current.get(id)
    if (existing) clearInterval(existing)

    const interval = setInterval(() => {
      setDownloads((prev) =>
        prev.map((d) => {
          if (d.id !== id) return d
          if (d.status !== 'downloading') return d
          // Simulate variable download speed.
          const step = 3 + Math.random() * 9
          const next = Math.min(100, d.progress + step)
          if (next >= 100) {
            const timer = timers.current.get(id)
            if (timer) clearInterval(timer)
            timers.current.delete(id)
            return { ...d, progress: 100, status: 'completed' }
          }
          return { ...d, progress: next }
        }),
      )
    }, 420)

    timers.current.set(id, interval)
  }, [])

  const startDownload = useCallback(
    (input: StartInput) => {
      const id = `dl_${Date.now()}_${Math.floor(Math.random() * 1000)}`
      const item: DownloadItem = {
        id,
        ...input,
        status: 'downloading',
        progress: 0,
        startedAt: Date.now(),
      }
      setDownloads((prev) => [item, ...prev])
      setPanelOpen(true)
      runProgress(id)
    },
    [runProgress],
  )

  const removeDownload = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) clearInterval(timer)
    timers.current.delete(id)
    setDownloads((prev) => prev.filter((d) => d.id !== id))
  }, [])

  const retryDownload = useCallback(
    (id: string) => {
      setDownloads((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, status: 'downloading', progress: 0 } : d,
        ),
      )
      runProgress(id)
    },
    [runProgress],
  )

  const clearCompleted = useCallback(() => {
    setDownloads((prev) => prev.filter((d) => d.status !== 'completed'))
  }, [])

  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((t) => clearInterval(t))
      map.clear()
    }
  }, [])

  const activeCount = downloads.filter(
    (d) => d.status === 'downloading' || d.status === 'queued',
  ).length
  const completedCount = downloads.filter((d) => d.status === 'completed').length

  return (
    <DownloadContext.Provider
      value={{
        downloads,
        activeCount,
        completedCount,
        panelOpen,
        setPanelOpen,
        startDownload,
        removeDownload,
        retryDownload,
        clearCompleted,
      }}
    >
      {children}
    </DownloadContext.Provider>
  )
}

export function useDownloads() {
  const ctx = useContext(DownloadContext)
  if (!ctx) {
    throw new Error('useDownloads must be used within a DownloadProvider')
  }
  return ctx
}
