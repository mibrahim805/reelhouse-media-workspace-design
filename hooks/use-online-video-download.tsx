'use client'

import { useCallback, useMemo, useState } from 'react'
import { DownloadConfirmation } from '@/components/download-confirmation'
import { QualityDialog } from '@/components/quality-dialog'
import { useDownloads } from '@/components/download-store'
import { useLibrary } from '@/components/library-store'
import { fetchMediaInfo, type MediaInfo, type QualityOption } from '@/lib/backend-api'
import { normalizeQualityValue, resolvePreferredQuality } from '@/lib/quality-preferences'
import type { OnlineVideo } from '@/types/media'
import type { OnlineVideoDownloadState } from '@/components/media/online-video-card'

type RequestPhase = OnlineVideoDownloadState['phase']

export function useOnlineVideoDownload() {
  const { downloads, startDownload, setPanelOpen } = useDownloads()
  const { preferences, rememberVideoQuality } = useLibrary()
  const [target, setTarget] = useState<OnlineVideo | null>(null)
  const [preview, setPreview] = useState<MediaInfo | null>(null)
  const [pendingQuality, setPendingQuality] = useState<QualityOption | null>(null)
  const [phase, setPhase] = useState<RequestPhase>('idle')
  const [error, setError] = useState('')
  const [qualityOpen, setQualityOpen] = useState(false)
  const [startedAt, setStartedAt] = useState(0)
  const [activeSourceUrl, setActiveSourceUrl] = useState('')

  const begin = useCallback(async (video: OnlineVideo) => {
    if (!video.sourceUrl) { setTarget(video); setPhase('failed'); setError('This video has no downloadable source URL.'); return }
    setTarget(video); setPreview(null); setPendingQuality(null); setQualityOpen(false); setPhase('analyzing'); setError(''); setStartedAt(0); setActiveSourceUrl('')
    try {
      const media = await fetchMediaInfo(video.sourceUrl)
      if (!media.qualities.length) throw new Error('No downloadable formats were returned for this video.')
      setPreview(media); setPhase('ready'); setQualityOpen(true)
    } catch (cause) {
      setPhase('failed'); setError(cause instanceof Error ? cause.message : 'Unable to prepare this video for download.')
    }
  }, [])

  const confirmQuality = useCallback((quality: string) => {
    if (!preview) return
    const canonicalQuality = normalizeQualityValue(quality)
    const selected = preview.qualities.find(option => option.value === canonicalQuality)
    if (!selected) return
    setPendingQuality(selected); setQualityOpen(false)
  }, [preview])

  const startConfirmed = useCallback(() => {
    if (!preview || !pendingQuality || !target) return
    const started = Date.now()
    setStartedAt(started)
    setActiveSourceUrl(preview.sourceUrl || target.sourceUrl)
    setPhase('downloading')
    rememberVideoQuality(pendingQuality.value)
    startDownload({ title: preview.title || target.title, channel: preview.channel || target.channel, thumbnail: preview.thumbnail || target.thumbnail, quality: pendingQuality.label, qualityValue: pendingQuality.value, size: pendingQuality.size, source: preview.platform || 'YouTube', sourceUrl: preview.sourceUrl || target.sourceUrl })
    setPendingQuality(null)
    setPanelOpen(true)
  }, [pendingQuality, preview, rememberVideoQuality, setPanelOpen, startDownload, target])

  const trackedDownload = useMemo(() => {
    if (!activeSourceUrl || !startedAt) return null
    return downloads.filter(item => item.sourceUrl === activeSourceUrl && item.startedAt >= startedAt - 1000).sort((a, b) => b.startedAt - a.startedAt)[0] || null
  }, [activeSourceUrl, downloads, startedAt])

  const initialQuality = preview
    ? resolvePreferredQuality(
        preview.qualities,
        preferences.defaultVideoQuality,
        preferences.rememberQuality ? preferences.rememberedVideoQuality : null,
      )
    : 'best'

  const getDownloadState = useCallback((video: OnlineVideo): OnlineVideoDownloadState => {
    if (!target || video.id !== target.id) return { phase: 'idle' }
    if (trackedDownload?.status === 'completed') return { phase: 'completed' }
    if (trackedDownload?.status === 'failed' || trackedDownload?.status === 'interrupted') return { phase: 'failed', error: trackedDownload.error }
    return { phase, error: phase === 'failed' ? error : undefined }
  }, [error, phase, target, trackedDownload])

  const dialogs = <>
    <QualityDialog open={qualityOpen} initialQuality={initialQuality} target={preview ? { title: preview.title, channel: preview.channel, thumbnail: preview.thumbnail, source: preview.platform, sourceUrl: preview.sourceUrl, qualities: preview.qualities } : null} onClose={() => setQualityOpen(false)} onConfirm={quality => confirmQuality(quality)} />
    <DownloadConfirmation media={preview} quality={pendingQuality} onClose={() => setPendingQuality(null)} onStart={startConfirmed} />
  </>

  return { begin, getDownloadState, dialogs }
}
