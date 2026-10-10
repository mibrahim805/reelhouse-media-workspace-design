'use client'

import { Check, Download, LoaderCircle, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useMedia } from '@/components/media-state'
import { OnlineVideoCard } from '@/components/media/online-video-card'
import { ReelhousePlayer } from '@/components/player/reelhouse-player'
import { useOnlineVideoDownload } from '@/hooks/use-online-video-download'
import { fetchMediaInfo, searchYouTube, type MediaInfo } from '@/lib/backend-api'
import type { OnlineVideo } from '@/types/media'
import { buildRelatedVideoQuery, filterRelatedVideos, hasUsableRelatedTitle } from '@/lib/related-query'
import { useNetworkStatus } from '@/lib/network-status'

const RELATED_RESULT_LIMIT = 20

function RelatedSkeleton() {
  return <div className="online-suggestion-skeleton animate-pulse">
    <div className="aspect-video w-40 shrink-0 rounded-2xl bg-[#151515] sm:w-48" />
    <div className="min-w-0 flex-1 py-1">
      <div className="h-4 w-11/12 rounded bg-[#151515]" />
      <div className="mt-3 h-3 w-2/5 rounded bg-[#151515]" />
    </div>
  </div>
}

export function OnlineWatch({ videoId }: { videoId: string }) {
  const { source, openOnline } = useMedia()
  const online = useNetworkStatus()
  const download = useOnlineVideoDownload()
  const sourceUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
  const [metadata, setMetadata] = useState<MediaInfo | null>(null)
  const [related, setRelated] = useState<OnlineVideo[]>([])
  const [loadingRelated, setLoadingRelated] = useState(true)
  const [relatedError, setRelatedError] = useState('')
  const [reload, setReload] = useState(0)
  const [titleExpanded, setTitleExpanded] = useState(false)

  const title = hasUsableRelatedTitle(metadata?.title) ? metadata!.title : ''
  const displayTitle = title || 'Loading online video…'
  const onlineVideo = useMemo<OnlineVideo>(() => ({
    id: videoId,
    title,
    channel: metadata?.channel || 'YouTube',
    duration: metadata?.duration || '',
    thumbnail: metadata?.thumbnail || '',
    sourceUrl: metadata?.sourceUrl || sourceUrl,
  }), [metadata?.channel, metadata?.duration, metadata?.sourceUrl, metadata?.thumbnail, sourceUrl, title, videoId])
  const downloadState = download.getDownloadState(onlineVideo)
  const playerSource = useMemo(() => ({ type: 'youtube' as const, videoId, title, thumbnail: metadata?.thumbnail, channel: metadata?.channel }), [metadata?.channel, metadata?.thumbnail, title, videoId])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    setTitleExpanded(false)
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
        if (!online) {
          setRelated([])
          setRelatedError('This video needs an internet connection.')
          return
        }
        const current = await fetchMediaInfo(sourceUrl)
        if (cancelled) return
        setMetadata(current)

        const relatedVideo = { title: current.title, channel: current.channel, category: current.category, description: current.description, tags: current.tags }
        const query = hasUsableRelatedTitle(current.title) ? buildRelatedVideoQuery(relatedVideo) : ''
        if (!query) {
          setRelatedError('Related videos are unavailable until this video metadata is loaded.')
          return
        }
        const results = await searchYouTube(query, RELATED_RESULT_LIMIT)
        if (cancelled) return
        setRelated(filterRelatedVideos(results, videoId, relatedVideo, 10))
      } catch (error) {
        if (!cancelled) setRelatedError(error instanceof Error ? error.message : 'Unable to load related videos.')
      } finally {
        if (!cancelled) setLoadingRelated(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [online, reload, sourceUrl, videoId])

  const downloadLabel = downloadState.phase === 'completed' ? 'Downloaded' : downloadState.phase === 'failed' ? 'Retry' : 'Download'

  return <>
    <main className="online-watch-page mx-auto w-full max-w-4xl px-3 pb-10 pt-3 sm:px-5 md:px-6 md:pt-5">
      <section className="online-watch-player-frame" aria-label="Online video player">
        {online ? <ReelhousePlayer source={playerSource} /> : <div className="flex aspect-video items-center justify-center rounded-2xl bg-black px-6 text-center text-sm text-[#a3a3a3]">This video needs an internet connection.</div>}
      </section>

      <section className="online-watch-details mt-4 px-1 sm:px-2">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => setTitleExpanded(value => !value)}
            aria-expanded={titleExpanded}
            aria-label={titleExpanded ? 'Collapse video title' : 'Expand video title'}
            className={`min-w-0 flex-1 text-left text-lg font-bold leading-snug text-white sm:text-xl ${titleExpanded ? '' : 'line-clamp-2'}`}
          >
            {displayTitle}
          </button>

          <button type="button" onClick={() => download.begin(onlineVideo)} disabled={downloadState.phase === 'analyzing' || downloadState.phase === 'ready' || downloadState.phase === 'downloading'} className="online-watch-download-button shrink-0" aria-label={`${downloadLabel} video`}>
            {downloadState.phase === 'analyzing' || downloadState.phase === 'downloading' ? <LoaderCircle className="size-4 animate-spin" /> : downloadState.phase === 'completed' ? <Check className="size-4" /> : downloadState.phase === 'failed' ? <RotateCcw className="size-4" /> : <Download className="size-4" />}
            <span className="hidden sm:inline">{downloadLabel}</span>
          </button>
        </div>
        <p className="mt-2 text-xs text-white/55">{metadata?.duration || 'Online video'} <span className="mx-1 text-white/25">•</span> {metadata?.platform || 'YouTube'}</p>

        {metadata?.description && <p className="mt-4 line-clamp-3 text-xs leading-relaxed text-white/60">{metadata.description}</p>}
      </section>

      <section className="mt-6" aria-labelledby="suggested-videos-heading">
        <div className="mb-3 flex items-end justify-between px-1">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-fuchsia-200/70">Up next</p>
            <h2 id="suggested-videos-heading" className="mt-1 text-xl font-bold text-white">Suggested videos</h2>
          </div>
          <span className="text-xs text-white/40">For you</span>
        </div>

        <div className="online-suggestions-list">
          {loadingRelated && <><RelatedSkeleton /><RelatedSkeleton /><RelatedSkeleton /></>}
          {!online && <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-center"><p className="text-sm font-semibold text-white">This video needs an internet connection.</p><p className="mt-1 text-xs text-[#a3a3a3]">Downloaded media remains available from Library.</p></div>}
          {!loadingRelated && online && relatedError && <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-center"><p className="text-sm text-[#a3a3a3]">Unable to load suggested videos.</p><button type="button" onClick={() => setReload(value => value + 1)} className="mt-3 rounded-xl bg-primary/10 px-4 py-2 text-xs font-semibold text-primary">Retry</button></div>}
          {!loadingRelated && !relatedError && related.length === 0 && <p className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-center text-xs text-[#737373]">No suggested videos found.</p>}
          {!loadingRelated && !relatedError && related.map(video => <OnlineVideoCard key={video.id} video={video} onDownload={download.begin} downloadState={download.getDownloadState(video)} compact />)}
        </div>
      </section>
    </main>
    {download.dialogs}
  </>
}
