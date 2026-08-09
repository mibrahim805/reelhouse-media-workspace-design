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

type DesktopDownloadState = {
  state: 'progress' | 'completed' | 'error'
  id: string
  progress?: number
  path?: string
  error?: string
}

function desktopApi() {
  return (window as Window & { reelhouseDesktop?: {
    localDownload: (input: { id: string; url: string; quality: string }) => Promise<{ ok: boolean }>
    onDownloadState: (listener: (state: DesktopDownloadState) => void) => () => void
  } }).reelhouseDesktop
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
  saveDownload: (id: string) => void
  removeDownload: (id: string) => void
  retryDownload: (id: string) => void
  clearCompleted: () => void
}

const DownloadContext = createContext<DownloadContextValue | null>(null)

function requestDeviceDownload(fileUrl: string, filename?: string) {
  const link = document.createElement('a')
  link.href = fileUrl
  link.download = filename || 'download'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [downloads, setDownloads] = useState<DownloadItem[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const pollers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())
  const pollFailures = useRef<Map<string, number>>(new Map())
  const deviceDownloadsStarted = useRef<Set<string>>(new Set())
  const restoredActiveJobs = useRef<Array<{ id: string; jobId: string }>>([])

  useEffect(() => {
    const api = desktopApi()
    if (!api) return
    return api.onDownloadState((event) => {
      setDownloads((prev) => prev.map((item) => {
        if (item.id !== event.id) return item
        if (event.state === 'progress') return { ...item, status: 'downloading', progress: event.progress ?? item.progress }
        if (event.state === 'completed') return { ...item, status: 'completed', progress: 100, filename: event.path?.split('/').pop() }
        return { ...item, status: 'failed', error: event.error || 'Local download failed.' }
      }))
    })
  }, [])

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('reelhouse.downloads')
      if (saved) {
        const restored = JSON.parse(saved) as DownloadItem[]
        restoredActiveJobs.current = restored
          .filter(
            (item): item is DownloadItem & { jobId: string } =>
              Boolean(item.jobId) &&
              (item.status === 'queued' ||
                item.status === 'downloading' ||
                item.status === 'processing'),
          )
          .map(({ id, jobId }) => ({ id, jobId }))
        setDownloads(restored)
      }
    } catch {
      // Storage is optional; downloads still work for the current session.
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem('reelhouse.downloads', JSON.stringify(downloads.slice(0, 50)))
    } catch {
      // Ignore quota and embedded-browser storage failures.
    }
  }, [downloads])

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

          if (
            job.status === 'complete' &&
            job.result?.fileUrl &&
            !deviceDownloadsStarted.current.has(id)
          ) {
            deviceDownloadsStarted.current.add(id)
            requestDeviceDownload(job.result.fileUrl, job.result.filename)
          }

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

  useEffect(() => {
    const jobs = restoredActiveJobs.current.splice(0)
    jobs.forEach(({ id, jobId }) => pollProgress(id, jobId))
  }, [pollProgress])

  const beginDownload = useCallback(
    async (input: StartInput, existingId?: string) => {
      const id =
        existingId ?? `dl_${Date.now()}_${Math.floor(Math.random() * 1000)}`

      if (existingId) {
        stopPolling(existingId)
        deviceDownloadsStarted.current.delete(existingId)
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
        const desktop = desktopApi()
        if (desktop) {
          await desktop.localDownload({ id, url: input.sourceUrl, quality: input.qualityValue })
          setDownloads((prev) => prev.map((download) => download.id === id ? { ...download, status: 'downloading', progress: 1 } : download))
          return
        }
        const jobId = await startBackendDownload(
          input.sourceUrl,
          input.qualityValue,
          `select-${id}`,
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
    deviceDownloadsStarted.current.delete(id)
    setDownloads((prev) => prev.filter((d) => d.id !== id))
  }, [stopPolling])

  const saveDownload = useCallback(
    (id: string) => {
      const item = downloads.find((download) => download.id === id)
      if (!item?.fileUrl) return
      requestDeviceDownload(item.fileUrl, item.filename)
    },
    [downloads],
  )

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
        saveDownload,
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
