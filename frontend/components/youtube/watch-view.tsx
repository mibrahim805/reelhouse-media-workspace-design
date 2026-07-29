'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Download,
  Loader2,
  Maximize2,
  Play,
} from 'lucide-react'
import { useDownloads } from '@/components/download-store'
import { QualityDialog } from '@/components/quality-dialog'
import {
  fetchVideoInfo,
  type MediaVideo,
  type QualityOption,
  youtubeEmbedUrl,
  youtubeUrlFromId,
  videoIdFromUrl,
} from '@/lib/backend-api'

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

function browserPlaybackVideo(value: string): MediaVideo | null {
  const id = value.startsWith('http') ? videoIdFromUrl(value) : value
  if (!YOUTUBE_VIDEO_ID.test(id)) return null

  const sourceUrl = youtubeUrlFromId(id)
  return {
    id,
    title: 'YouTube video',
    channel: 'YouTube',
    channelInitials: 'YT',
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    duration: 'Unknown duration',
    sourceUrl,
    platform: 'YouTube',
    embedUrl: `https://www.youtube.com/embed/${id}`,
    canEmbed: true,
    qualities: [],
  }
}

export function WatchView({ videoId }: { videoId: string }) {
  const { startDownload } = useDownloads()
  const [video, setVideo] = useState<MediaVideo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [success, setSuccess] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const playerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  async function toggleFullscreen(event?: React.MouseEvent<HTMLButtonElement>) {
    event?.preventDefault()
    event?.stopPropagation()
    const player = iframeRef.current ?? playerRef.current
    if (!player) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await player.requestFullscreen()
      }
    } catch {
      setError('Fullscreen is not available in this player.')
    }
  }

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  const qualities = video?.qualities ?? []
  const downloadQualities: QualityOption[] = qualities.length > 0
    ? qualities
    : [{ value: 'best', label: 'Best available', note: 'MP4 video', size: 'Unknown size' }]

  useEffect(() => {
    let cancelled = false

    async function loadVideo() {
      setLoading(true)
      setError('')
      setPlaying(false)
      setSuccess('')

      const fallback = browserPlaybackVideo(videoId)
      if (!fallback) {
        setVideo(null)
        setError('This is not a valid YouTube video link.')
        setLoading(false)
        return
      }

      // Playback happens in the visitor's browser, so it must not depend on
      // yt-dlp being accepted from the hosted backend's IP address.
      setVideo(fallback)

      try {
        const loaded = await fetchVideoInfo(fallback.sourceUrl)
        if (cancelled) return
        setVideo({
          ...loaded,
          id: fallback.id,
          sourceUrl: fallback.sourceUrl,
          embedUrl: fallback.embedUrl,
          canEmbed: true,
        })
      } catch (err) {
        if (!cancelled) {
          const reason =
            err instanceof Error
              ? err.message
              : 'The download server could not load this video.'
          setError(
            `Browser playback is still available. Download options are unavailable: ${reason}`,
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadVideo()

    return () => {
      cancelled = true
    }
  }, [videoId])

  function confirmDownload(q: QualityOption) {
    if (!video) return
    setSuccess('Download queued. Track progress in the downloads panel.')
    startDownload({
      title: video.title,
      channel: video.channel,
      thumbnail: video.thumbnail,
      quality: q.label,
      qualityValue: q.value,
      size: q.size,
      source: video.platform,
      sourceUrl: video.sourceUrl,
    })
  }

  if (loading && !video) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-24 text-muted-foreground">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-sm">Loading video...</p>
      </div>
    )
  }

  if (!video) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 px-4 py-24 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-6" />
        </div>
        <p className="text-lg font-semibold text-foreground">
          Invalid video link
        </p>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Link
          href="/youtube"
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          <ArrowLeft className="size-4" /> Back to workspace
        </Link>
      </div>
    )
  }

  const embedUrl = youtubeEmbedUrl(video)

  return (
    <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-5">
        <div className="min-w-0">
          <div ref={playerRef} className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black [&:fullscreen]:aspect-auto [&:fullscreen]:h-full [&:fullscreen]:rounded-none">
            {playing && embedUrl ? (
              <iframe
                src={embedUrl}
                title={video.title}
                ref={iframeRef}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              <>
                <img
                  src={video.thumbnail || '/placeholder.svg'}
                  alt=""
                  className="h-full w-full object-cover opacity-70"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <button
                    onClick={() => setPlaying(true)}
                    aria-label="Play"
                    className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform hover:scale-105"
                  >
                    <Play className="size-7 translate-x-0.5 fill-current" />
                  </button>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-lg bg-black/65 text-white transition-colors hover:bg-black/85"
            >
              <Maximize2 className="size-4" />
            </button>
          </div>

          <h1 className="mt-4 text-lg font-semibold leading-snug text-foreground text-balance sm:text-xl">
            {video.title}
          </h1>
          <button
            onClick={() => setDialogOpen(true)}
            disabled={loading}
            className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            {loading ? 'Loading…' : 'Download'}
          </button>
          {success && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
              <Check className="size-3.5" />
              {success}
            </p>
          )}
        </div>

      {dialogOpen && (
        <QualityDialog
          open={dialogOpen}
          target={{
            title: video.title,
            channel: video.channel,
            thumbnail: video.thumbnail,
            source: video.platform,
          }}
          qualities={downloadQualities}
          onClose={() => setDialogOpen(false)}
          onConfirm={confirmDownload}
        />
      )}
    </div>
  )
}
