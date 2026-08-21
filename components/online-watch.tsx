'use client'

import { Check, Download, LoaderCircle, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMedia } from '@/components/media-state'
import { OnlineVideoCard } from '@/components/media/online-video-card'
import { ReelhousePlayer } from '@/components/player/reelhouse-player'
import { useOnlineVideoDownload } from '@/hooks/use-online-video-download'
import { fetchMediaInfo, searchYouTube, type MediaInfo } from '@/lib/backend-api'
import type { OnlineVideo } from '@/types/media'

const RELATED_RESULT_LIMIT = 12

function relatedQuery(title: string) {
  const stopWords = new Set(['a', 'an', 'and', 'for', 'from', 'in', 'of', 'the', 'to', 'via', 'with'])
  const words = title
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word.toLowerCase()))
  return words.slice(0, 7).join(' ') || title.trim().slice(0, 80)
}

function RelatedSkeleton() {
  return <div className="animate-pulse">
    <div className="aspect-video rounded-2xl bg-[#151515]" />
    <div className="mt-3 h-4 w-11/12 rounded bg-[#151515]" />
    <div className="mt-2 h-3 w-2/5 rounded bg-[#151515]" />
  </div>
}

export function OnlineWatch({ videoId }: { videoId: string }) {
  const { source, openOnline } = useMedia()
  const download = useOnlineVideoDownload()
  const sourceUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
  const [metadata, setMetadata] = useState<MediaInfo | null>(null)
  const [related, setRelated] = useState<OnlineVideo[]>([])
  const [loadingRelated, setLoadingRelated] = useState(true)
  const [relatedError, setRelatedError] = useState('')
  const [reload, setReload] = useState(0)
  const relatedScrollRef = useRef<HTMLDivElement>(null)

  const title = metadata?.title || ''
  const onlineVideo = useMemo<OnlineVideo>(() => ({
    id: videoId,
    title,
    channel: metadata?.channel || 'YouTube',
    duration: metadata?.duration || '',
    thumbnail: metadata?.thumbnail || '',
    sourceUrl: metadata?.sourceUrl || sourceUrl,
  }), [metadata?.channel, metadata?.duration, metadata?.sourceUrl, metadata?.thumbnail, sourceUrl, title, videoId])
  const downloadState = download.getDownloadState(onlineVideo)
  const playerSource = useMemo(() => ({ type: 'youtube' as const, videoId, title }), [title, videoId])

  useEffect(() => {
    relatedScrollRef.current?.scrollTo({ top: 0 })
  }, [videoId])

  useEffect(() => {
    if (source?.type !== 'youtube' || source.videoId !== videoId) {
      openOnline({ type: 'youtube', videoId, title })
    } else if (title && source.title !== title) {
      // Update the session metadata after fetch-info resolves without
      // recreating or resetting the active player.
      openOnline({ ...source, title })
    }
  }, [openOnline, source, title, videoId])

  useEffect(() => {
    let cancelled = false
    setMetadata(null)
    setRelated([])
    setLoadingRelated(true)
    setRelatedError('')

    async function load() {
      try {
        const current = await fetchMediaInfo(sourceUrl)
        if (cancelled) return
        setMetadata(current)

        const results = await searchYouTube(relatedQuery(current.title), RELATED_RESULT_LIMIT)
        if (cancelled) return
        const seen = new Set<string>([videoId])
        setRelated(results.filter(video => {
          if (!video.id || seen.has(video.id)) return false
          seen.add(video.id)
          return true
        }).slice(0, 10))
      } catch (error) {
        if (!cancelled) setRelatedError(error instanceof Error ? error.message : 'Unable to load related videos.')
      } finally {
        if (!cancelled) setLoadingRelated(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [reload, sourceUrl, videoId])

  return <>
    <main className="mx-auto flex h-[calc(100dvh-4.5rem)] w-full max-w-5xl flex-col overflow-hidden px-4 pt-4 sm:px-6 md:h-[calc(100dvh-3.5rem)] md:pb-4">
      <header className="mb-4 flex min-h-10 shrink-0 items-center gap-3">
        <a href="/search" className="flex size-10 items-center justify-center rounded-full text-[#a3a3a3] hover:bg-[#151515] hover:text-white" aria-label="Back">
          <span aria-hidden="true" className="text-2xl leading-none">‹</span>
        </a>
        {title && <h1 className="truncate text-sm font-semibold text-white">{title}</h1>}
      </header>

      <div className="shrink-0">
        <ReelhousePlayer source={playerSource} />
      </div>

      <div ref={relatedScrollRef} className="mt-4 min-h-0 flex-1 overscroll-contain overflow-y-auto pb-24 [scrollbar-width:auto]">
        <div className="flex items-start gap-3">
          <h2 className="min-w-0 flex-1 text-lg font-bold leading-snug text-white">{title}</h2>
          <button
            type="button"
            onClick={() => download.begin(onlineVideo)}
            disabled={downloadState.phase === 'analyzing' || downloadState.phase === 'ready' || downloadState.phase === 'downloading'}
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#292929] bg-[#151515] text-[#a3a3a3] transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary disabled:cursor-wait disabled:opacity-70"
            aria-label={downloadState.phase === 'completed' ? 'Downloaded' : downloadState.phase === 'failed' ? 'Retry download' : 'Download video'}
          >
            {downloadState.phase === 'analyzing' ? <LoaderCircle className="size-[18px] animate-spin" /> : downloadState.phase === 'completed' ? <Check className="size-[18px] text-primary" /> : downloadState.phase === 'failed' ? <RotateCcw className="size-[18px]" /> : <Download className="size-[18px]" />}
          </button>
        </div>

        <section>
          <div className="grid gap-y-7">
            {loadingRelated && <><RelatedSkeleton /><RelatedSkeleton /><RelatedSkeleton /></>}
            {!loadingRelated && relatedError && <div className="rounded-2xl border border-dashed border-[#292929] px-4 py-5 text-center"><p className="text-sm text-[#a3a3a3]">Unable to load related videos.</p><button type="button" onClick={() => setReload(value => value + 1)} className="mt-3 rounded-xl bg-primary/10 px-4 py-2 text-xs font-semibold text-primary">Retry</button></div>}
            {!loadingRelated && !relatedError && related.length === 0 && <p className="rounded-2xl border border-dashed border-[#292929] px-4 py-5 text-center text-xs text-[#737373]">No related videos found.</p>}
            {!loadingRelated && !relatedError && related.map(video => <OnlineVideoCard key={video.id} video={video} onDownload={download.begin} downloadState={download.getDownloadState(video)} showChannel={false} />)}
          </div>
        </section>
      </div>
    </main>
    {download.dialogs}
  </>
}
