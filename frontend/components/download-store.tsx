'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  fetchDownloadProgress,
  startBackendDownload,
} from '@/lib/backend-api'

export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'processing'
  | 'completed'
  | 'failed'

export type DownloadItem = {
  id: string
  jobId?: string
  title: string
  channel: string
  thumbnail: string
  quality: string
  qualityValue: string
  size: string
  source: string
  sourceUrl: string
  status: DownloadStatus
  progress: number
  startedAt: number
  fileUrl?: string
  filename?: string
  error?: string
}

type StartInput = {
  title: string
  channel: string
  thumbnail: string
  quality: string
  qualityValue: string
  size: string
  source: string
  sourceUrl: string
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
  const pollers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())
  const pollFailures = useRef<Map<string, number>>(new Map())

  const stopPolling = useCallback((id: string) => {
    const existing = pollers.current.get(id)
    if (existing) clearInterval(existing)
    pollers.current.delete(id)
    pollFailures.current.delete(id)
  }, [])

  const pollProgress = useCallback(
    (id: string, jobId: string) => {
      stopPolling(id)

      const readProgress = async () => {
        try {
          const job = await fetchDownloadProgress(jobId)
          const terminal = job.status === 'complete' || job.status === 'error'
          pollFailures.current.delete(id)

          setDownloads((prev) =>
            prev.map((download) => {
              if (download.id !== id) return download

              if (job.status === 'complete') {
                return {
                  ...download,
                  status: 'completed',
                  progress: 100,
                  fileUrl: job.result?.fileUrl,
                  filename: job.result?.filename,
                  size: job.result?.filesizeMb
                    ? `${job.result.filesizeMb} MB`
                    : download.size,
                }
              }

              if (job.status === 'error') {
                return {
                  ...download,
                  status: 'failed',
                  progress: 0,
                  error: job.error || 'Download failed.',
                }
              }

              return {
                ...download,
                status: job.status,
                progress: Math.max(0, Math.min(job.percent, 99)),
              }
            }),
          )

          if (terminal) stopPolling(id)
        } catch (error) {
          const failures = (pollFailures.current.get(id) ?? 0) + 1
          pollFailures.current.set(id, failures)

          if (failures < 5) return

          stopPolling(id)
          setDownloads((prev) =>
            prev.map((download) =>
              download.id === id
                ? {
                    ...download,
                    status: 'failed',
                    error:
                      error instanceof Error
                        ? error.message
                        : 'Could not read download progress.',
                  }
                : download,
            ),
          )
        }
      }

      void readProgress()
      pollers.current.set(id, setInterval(readProgress, 900))
    },
    [stopPolling],
  )

  const beginDownload = useCallback(
    async (input: StartInput, existingId?: string) => {
      const id =
        existingId ?? `dl_${Date.now()}_${Math.floor(Math.random() * 1000)}`

      if (existingId) {
        stopPolling(existingId)
        setDownloads((prev) =>
          prev.map((download) =>
            download.id === existingId
              ? {
                  ...download,
                  ...input,
                  jobId: undefined,
                  status: 'queued',
                  progress: 0,
                  fileUrl: undefined,
                  filename: undefined,
                  error: undefined,
                }
              : download,
          ),
        )
      } else {
        const item: DownloadItem = {
          id,
          ...input,
          status: 'queued',
          progress: 0,
          startedAt: Date.now(),
        }
        setDownloads((prev) => [item, ...prev])
      }

      setPanelOpen(true)

      try {
        const jobId = await startBackendDownload(
          input.sourceUrl,
          input.qualityValue,
        )
        setDownloads((prev) =>
          prev.map((download) =>
            download.id === id
              ? { ...download, jobId, status: 'downloading', progress: 1 }
              : download,
          ),
        )
        pollProgress(id, jobId)
      } catch (error) {
        setDownloads((prev) =>
          prev.map((download) =>
            download.id === id
              ? {
                  ...download,
                  status: 'failed',
                  progress: 0,
                  error:
                    error instanceof Error
                      ? error.message
                      : 'Could not start download.',
                }
              : download,
          ),
        )
      }
    },
    [pollProgress, stopPolling],
  )

  const startDownload = useCallback(
    (input: StartInput) => {
      void beginDownload(input)
    },
    [beginDownload],
  )

  const removeDownload = useCallback((id: string) => {
    stopPolling(id)
    setDownloads((prev) => prev.filter((d) => d.id !== id))
  }, [stopPolling])

  const retryDownload = useCallback(
    (id: string) => {
      const item = downloads.find((download) => download.id === id)
      if (!item) return

      void beginDownload(
        {
          title: item.title,
          channel: item.channel,
          thumbnail: item.thumbnail,
          quality: item.quality,
          qualityValue: item.qualityValue,
          size: item.size,
          source: item.source,
          sourceUrl: item.sourceUrl,
        },
        id,
      )
    },
    [beginDownload, downloads],
  )

  const clearCompleted = useCallback(() => {
    setDownloads((prev) => prev.filter((d) => d.status !== 'completed'))
  }, [])

  useEffect(() => {
    const map = pollers.current
    return () => {
      map.forEach((t) => clearInterval(t))
      map.clear()
    }
  }, [])

  const activeCount = downloads.filter(
    (d) =>
      d.status === 'downloading' ||
      d.status === 'queued' ||
      d.status === 'processing',
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
