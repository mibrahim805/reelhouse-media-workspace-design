'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Play,
} from 'lucide-react'
import { useDownloads } from '@/components/download-store'
import { QualityDialog } from '@/components/quality-dialog'
import {
  getPreparationStatus,
  prepareVideo,
  type MediaVideo,
  type QualityOption,
  youtubeEmbedUrl,
  youtubeUrlFromId,
  videoIdFromUrl,
} from '@/lib/backend-api'

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const CUSTOM_DOWNLOAD_QUALITIES: QualityOption[] = [
  { value: 'audio', label: 'Audio only', note: 'Best available audio', size: 'Estimated size' },
  ...[144, 240, 360, 480, 720, 1080].map((height) => ({
    value: String(height),
    label: `Up to ${height}p`,
    note: 'MP4 video',
    size: 'Estimated size',
  })),
]

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
  const [playerControlsVisible, setPlayerControlsVisible] = useState(true)
  const searchResults = (() => {
    try {
      const saved =
        window.sessionStorage.getItem('reelhouse.active-results') ??
        window.sessionStorage.getItem('reelhouse.home-feed')
      return saved ? (JSON.parse(saved) as MediaVideo[]) : []
    } catch {
      return []
    }
  })()
  const playerRef = useRef<HTMLDivElement>(null)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const showPlayerControls = useCallback(() => {
    setPlayerControlsVisible(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    if (playing) {
      controlsTimeoutRef.current = setTimeout(() => {
        setPlayerControlsVisible(false)
      }, 2600)
    }
  }, [playing])

  // Start the same auto-hide timer after the playing state has committed.
  // This keeps overlay controls such as Previous/Next synchronized with
  // Play/Pause instead of relying on the click handler's stale state.
  useEffect(() => {
    showPlayerControls()
  }, [playing, showPlayerControls])

  useEffect(() => {
    function onPointerMove(event: MouseEvent) {
      const player = playerRef.current
      if (!player) return
      const bounds = player.getBoundingClientRect()
      if (
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom
      ) {
        showPlayerControls()
      }
    }

    window.addEventListener('mousemove', onPointerMove)
    return () => {
      window.removeEventListener('mousemove', onPointerMove)
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    }
  }, [playing, showPlayerControls])

  const downloadQualities = CUSTOM_DOWNLOAD_QUALITIES

  useEffect(() => {
    let cancelled = false

    async function loadVideo() {
      setLoading(true)
      setError('')
      setPlaying(false)
      setPlayerControlsVisible(true)
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
      const operationId = `prepare-${fallback.id}-${Date.now()}`
      void prepareVideo(fallback.sourceUrl, fallback.id, operationId).catch(() => {
        // Playback and the quality selector remain independent of preparation.
      })

      setLoading(false)
    }

    void loadVideo()

    return () => {
      cancelled = true
    }
  }, [videoId])

  function openDownloadDialog() {
    if (!video) return
    setDialogOpen(true)
    void getPreparationStatus(video.sourceUrl, `download-${video.id}-${Date.now()}`).catch(() => undefined)
  }

  function confirmDownload(q: QualityOption) {
    if (!video) return
    setSuccess('Preparing your download. It will start automatically.')
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
  const navigationVideos = searchResults.some((item) => item.id === video.id)
    ? searchResults
    : [video, ...searchResults]
  const currentIndex = navigationVideos.findIndex((item) => item.id === video.id)
  const previousVideo = currentIndex > 0 ? navigationVideos[currentIndex - 1] : null
  const nextVideo = currentIndex >= 0 && currentIndex < navigationVideos.length - 1
    ? navigationVideos[currentIndex + 1]
    : null

  function openSearchVideo(target: MediaVideo | null) {
    if (!target?.id) return
    window.location.assign(`/youtube/watch/${encodeURIComponent(target.id)}`)
  }
  return (
    <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-5">
        <div className="min-w-0">
          <div
            ref={playerRef}
            onTouchStart={showPlayerControls}
            className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black [&:fullscreen]:aspect-auto [&:fullscreen]:h-full [&:fullscreen]:rounded-none"
          >
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
                    onClick={() => {
                      setPlaying(true)
                      showPlayerControls()
                    }}
                    aria-label="Play"
                    className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform hover:scale-105"
                  >
                    <Play className="size-7 translate-x-0.5 fill-current" />
                  </button>
                </div>
              </>
            )}

          </div>

          {navigationVideos.length > 1 && currentIndex >= 0 && (
            <div className="mt-3 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => openSearchVideo(previousVideo)}
                disabled={!previousVideo}
                aria-label="Previous video"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="size-4" /> Previous
              </button>
              <button
                type="button"
                onClick={() => openSearchVideo(nextVideo)}
                disabled={!nextVideo}
                aria-label="Next video"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next <ChevronRight className="size-4" />
              </button>
            </div>
          )}

          <h1 className="mt-4 text-lg font-semibold leading-snug text-foreground text-balance sm:text-xl">
            {video.title}
          </h1>
          <button
            onClick={openDownloadDialog}
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
