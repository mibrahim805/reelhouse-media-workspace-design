'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { cancelBackendDownload, fetchBackendProgress, fetchLocalMedia, startBackendDownload, type LocalMediaItem } from '@/lib/backend-api'
import { normalizeQualityValue } from '@/lib/quality-preferences'

export type DownloadStatus = 'queued' | 'downloading' | 'processing' | 'completed' | 'failed' | 'canceled' | 'interrupted'
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
  fileUrl?: string
  filename?: string
  status: DownloadStatus
  progress: number
  speed?: number | null
  eta?: number | null
  error?: string
  startedAt: number
}

type DesktopDownloadState = {
  state: 'started' | 'progress' | 'completed' | 'error' | 'canceled'
  id?: string
  progress?: number
  path?: string
  filename?: string
  error?: string
}

type DesktopApi = {
  localDownload: (input: { id: string; url: string; quality: string }) => Promise<{ ok: boolean }>
  cancelLocalDownload: (id: string) => Promise<{ ok: boolean }>
  onDownloadState: (listener: (state: DesktopDownloadState) => void) => () => void
}

function desktopApi(): DesktopApi | null {
  if (typeof window === 'undefined') return null
  return (window as Window & { reelhouseDesktop?: DesktopApi }).reelhouseDesktop || null
}

function desktopMediaUrl(filePath?: string) {
  const filename = filePath?.split(/[\\/]/).pop()
  return filename ? `reelhouse-media://local/${encodeURIComponent(filename)}` : undefined
}

function fromLocalMedia(item: LocalMediaItem): DownloadItem {
  return {
    id: item.id,
    title: item.title,
    channel: item.channel,
    thumbnail: item.thumbnail,
    quality: 'Local',
    qualityValue: item.qualityValue || (item.mediaType === 'audio' ? 'audio' : 'best'),
    size: item.size,
    source: item.source,
    sourceUrl: '',
    fileUrl: item.fileUrl,
    filename: item.filename,
    status: 'completed',
    progress: 100,
    startedAt: item.startedAt,
  }
}

type StartInput = { title: string; channel: string; thumbnail: string; quality: string; qualityValue?: string; size: string; source: string; sourceUrl: string }
type Value = { downloads: DownloadItem[]; activeCount: number; completedCount: number; panelOpen: boolean; setPanelOpen: (value: boolean) => void; startDownload: (value: StartInput) => void; cancelDownload: (id: string) => void; removeDownload: (id: string) => void; retryDownload: (id: string) => void; clearCompleted: () => void; saveDownload: (id: string) => void }
const Context = createContext<Value | null>(null)

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [downloads, setDownloads] = useState<DownloadItem[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const pollers = useRef(new Map<string, ReturnType<typeof setInterval>>())
  const failures = useRef(new Map<string, number>())

  const stop = useCallback((id: string) => {
    const timer = pollers.current.get(id)
    if (timer) clearInterval(timer)
    pollers.current.delete(id)
    failures.current.delete(id)
  }, [])

  const poll = useCallback((id: string, jobId: string) => {
    stop(id)
    const read = async () => {
      try {
        const job = await fetchBackendProgress(jobId)
        failures.current.delete(id)
        setDownloads(previous => previous.map(download => download.id !== id ? download : job.status === 'complete'
          ? { ...download, status: 'completed', progress: 100, speed: job.speed, eta: 0, fileUrl: job.result?.fileUrl, filename: job.result?.filename, size: job.result?.filesizeMb ? `${job.result.filesizeMb} MB` : download.size, error: undefined }
          : job.status === 'error'
            ? { ...download, status: 'failed', progress: job.percent, error: job.error || 'Download failed.' }
            : job.status === 'canceled'
              ? { ...download, status: 'canceled', error: 'Download canceled.' }
              : { ...download, status: job.status, progress: Math.max(0, Math.min(job.percent, 99)), speed: job.speed, eta: job.eta, error: undefined }))
        if (['complete', 'error', 'canceled'].includes(job.status)) stop(id)
      } catch (error) {
        const count = (failures.current.get(id) || 0) + 1
        failures.current.set(id, count)
        if (count >= 5) {
          stop(id)
          setDownloads(previous => previous.map(download => download.id === id ? { ...download, status: 'interrupted', error: error instanceof Error ? error.message : 'Network interruption.' } : download))
        }
      }
    }
    void read()
    pollers.current.set(id, setInterval(read, 1000))
  }, [stop])

  useEffect(() => {
    const desktop = desktopApi()
    if (!desktop) return
    return desktop.onDownloadState(event => {
      if (!event.id) return
      setDownloads(previous => previous.map(download => {
        if (download.id !== event.id) return download
        if (event.state === 'started' || event.state === 'progress') return { ...download, status: 'downloading', progress: event.progress ?? download.progress }
        if (event.state === 'completed') return { ...download, status: 'completed', progress: 100, fileUrl: desktopMediaUrl(event.path), filename: event.filename || event.path?.split(/[\\/]/).pop(), error: undefined }
        if (event.state === 'canceled') return { ...download, status: 'canceled', error: 'Download canceled.' }
        return { ...download, status: 'failed', error: event.error || 'Local download failed.' }
      }))
    })
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('reelhouse.downloads')
      if (raw) {
        const saved = JSON.parse(raw) as DownloadItem[]
        setDownloads(saved)
        saved.filter(download => download.jobId && ['queued', 'downloading', 'processing', 'interrupted'].includes(download.status)).forEach(download => poll(download.id, download.jobId!))
      }
    } catch {
      // Local history is optional.
    } finally {
      setHydrated(true)
    }
  }, [poll])

  const syncLocalMedia = useCallback(() => {
    void fetchLocalMedia().then(data => {
      const localItems = [...data.downloads, ...data.videos, ...data.music]
      if (localItems.length) setDownloads(previous => {
        const existing = new Set(previous.map(item => item.id))
        return [...previous, ...localItems.filter(item => !existing.has(item.id)).map(fromLocalMedia)]
      })
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    syncLocalMedia()
    window.addEventListener('reelhouse-media-permission', syncLocalMedia)
    return () => window.removeEventListener('reelhouse-media-permission', syncLocalMedia)
  }, [syncLocalMedia])

  useEffect(() => {
    if (hydrated) try { localStorage.setItem('reelhouse.downloads', JSON.stringify(downloads.slice(0, 50))) } catch { /* optional */ }
  }, [downloads, hydrated])

  const begin = useCallback(async (input: StartInput, existing?: string) => {
    const id = existing || `dl_${Date.now()}`
    const qualityValue = normalizeQualityValue(input.qualityValue || input.quality)
    const item: DownloadItem = { id, ...input, qualityValue, status: 'queued', progress: 0, startedAt: Date.now() }
    setDownloads(previous => existing ? previous.map(download => download.id === existing ? item : download) : [item, ...previous])
    setPanelOpen(true)
    try {
      const desktop = desktopApi()
      if (desktop) {
        await desktop.localDownload({ id, url: input.sourceUrl, quality: qualityValue })
        setDownloads(previous => previous.map(download => download.id === id ? { ...download, status: 'downloading', progress: 1 } : download))
        return
      }
      const jobId = await startBackendDownload(input.sourceUrl, qualityValue)
      setDownloads(previous => previous.map(download => download.id === id ? { ...download, jobId, status: 'queued' } : download))
      poll(id, jobId)
    } catch (error) {
      setDownloads(previous => previous.map(download => download.id === id ? { ...download, status: 'failed', error: error instanceof Error ? error.message : 'Could not start download.' } : download))
    }
  }, [poll])

  const startDownload = useCallback((value: StartInput) => { void begin(value) }, [begin])
  const retryDownload = useCallback((id: string) => {
    const download = downloads.find(item => item.id === id)
    if (download) void begin({ title: download.title, channel: download.channel, thumbnail: download.thumbnail, quality: download.quality, qualityValue: download.qualityValue, size: download.size, source: download.source, sourceUrl: download.sourceUrl }, id)
  }, [begin, downloads])
  const cancelDownload = useCallback((id: string) => {
    const download = downloads.find(item => item.id === id)
    const desktop = desktopApi()
    stop(id)
    setDownloads(previous => previous.map(item => item.id === id ? { ...item, status: 'canceled', error: 'Download canceled.' } : item))
    if (desktop && !download?.jobId) void desktop.cancelLocalDownload(id).catch(() => undefined)
    else if (download?.jobId) void cancelBackendDownload(download.jobId).catch(() => setDownloads(previous => previous.map(item => item.id === id ? { ...item, status: 'interrupted', error: 'Could not confirm cancellation with backend.' } : item)))
  }, [downloads, stop])
  const removeDownload = useCallback((id: string) => { stop(id); setDownloads(previous => previous.filter(item => item.id !== id)) }, [stop])
  const clearCompleted = useCallback(() => setDownloads(previous => previous.filter(item => item.status !== 'completed')), [])
  const saveDownload = useCallback((id: string) => {
    const download = downloads.find(item => item.id === id)
    if (download?.fileUrl) {
      const anchor = document.createElement('a')
      anchor.href = download.fileUrl
      anchor.download = download.filename || 'download'
      anchor.click()
    }
  }, [downloads])

  useEffect(() => () => { pollers.current.forEach(clearInterval); pollers.current.clear() }, [])

  const activeCount = downloads.filter(item => ['queued', 'downloading', 'processing'].includes(item.status)).length
  const completedCount = downloads.filter(item => item.status === 'completed').length
  return <Context.Provider value={{ downloads, activeCount, completedCount, panelOpen, setPanelOpen, startDownload, cancelDownload, removeDownload, retryDownload, clearCompleted, saveDownload }}>{children}</Context.Provider>
}

export function useDownloads() {
  const value = useContext(Context)
  if (!value) throw new Error('useDownloads must be used within DownloadProvider')
  return value
}
