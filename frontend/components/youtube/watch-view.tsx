'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  Check,
  Download,
  ListVideo,
  Loader2,
  Maximize2,
  Play,
  Settings,
  Share2,
  ThumbsUp,
  Volume2,
} from 'lucide-react'
import { useDownloads } from '@/components/download-store'
import { QualityDialog } from '@/components/quality-dialog'
import {
  fetchVideoInfo,
  fetchYouTubeTopic,
  type MediaVideo,
  type QualityOption,
  youtubeEmbedUrl,
  youtubeUrlFromId,
} from '@/lib/backend-api'

function watchHref(video: MediaVideo) {
  if (video.id && !video.id.startsWith('http')) {
    return `/youtube/watch/${encodeURIComponent(video.id)}`
  }

  return `/downloader?url=${encodeURIComponent(video.sourceUrl)}`
}

export function WatchView({ videoId }: { videoId: string }) {
  const { startDownload } = useDownloads()
  const [video, setVideo] = useState<MediaVideo | null>(null)
  const [upNext, setUpNext] = useState<MediaVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(false)
  const [quality, setQuality] = useState('best')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [descOpen, setDescOpen] = useState(false)
  const [success, setSuccess] = useState('')

  const qualities = video?.qualities ?? []

  useEffect(() => {
    let cancelled = false

    async function loadVideo() {
      setLoading(true)
      setError('')

      try {
        const sourceUrl = videoId.startsWith('http')
          ? videoId
          : youtubeUrlFromId(videoId)
        const loaded = await fetchVideoInfo(sourceUrl)
        const options = loaded.qualities ?? []
        if (options.length === 0) {
          throw new Error('The backend did not return any download qualities.')
        }
        const preferred =
          options.find((option) => option.value === '1080') ?? options[0]

        if (cancelled) return
        setVideo(loaded)
        setQuality(preferred.value)
        setSuccess('')

        try {
          const topic = await fetchYouTubeTopic('All')
          if (!cancelled) {
            setUpNext(
              topic.videos
                .filter((item) => item.id !== loaded.id)
                .slice(0, 8),
            )
          }
        } catch {
          if (!cancelled) setUpNext([])
        }
      } catch (err) {
        if (!cancelled) {
          setVideo(null)
          setError(err instanceof Error ? err.message : 'Video not found.')
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-24 text-muted-foreground">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-sm">Loading video...</p>
      </div>
    )
  }

  if (error || !video) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 px-4 py-24 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-6" />
        </div>
        <p className="text-lg font-semibold text-foreground">Video not found</p>
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

  const selectedQuality =
    qualities.find((option) => option.value === quality) ?? qualities[0]
  const embedUrl = youtubeEmbedUrl(video)

  return (
    <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
            {playing && embedUrl ? (
              <iframe
                src={embedUrl}
                title={video.title}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
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

            {!playing && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-white/25">
                  <div className="h-full w-[8%] rounded-full bg-primary" />
                </div>
                <div className="flex items-center gap-3 text-white">
                  <button onClick={() => setPlaying(true)} aria-label="Play">
                    <Play className="size-5 fill-current" />
                  </button>
                  <Volume2 className="size-5" />
                  <span className="text-xs tabular-nums text-white/90">
                    Ready / {video.duration}
                  </span>
                  <div className="ml-auto flex items-center gap-3">
                    <span className="rounded bg-white/15 px-1.5 py-0.5 text-[11px] font-medium">
                      {selectedQuality?.label ?? 'Best'}
                    </span>
                    <Settings className="size-5" />
                    <Maximize2 className="size-5" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <h1 className="mt-3 text-lg font-semibold leading-snug text-foreground text-balance sm:text-xl">
            {video.title}
          </h1>
          {success && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
              <Check className="size-3.5" />
              {success}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground">
                {video.channelInitials}
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {video.channel}
                </p>
                <p className="text-xs text-muted-foreground">
                  {video.duration} · {video.platform}
                </p>
              </div>
              <button className="ml-2 h-9 rounded-full bg-foreground px-4 text-sm font-semibold text-background transition-opacity hover:opacity-90">
                Subscribe
              </button>
            </div>

            <div className="flex items-center gap-2 sm:ml-auto">
              <button className="flex h-9 items-center gap-1.5 rounded-full bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                <ThumbsUp className="size-4" /> Like
              </button>
              <button className="flex h-9 items-center gap-1.5 rounded-full bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                <Share2 className="size-4" /> Share
              </button>

              <div className="flex items-center overflow-hidden rounded-full">
                <label className="sr-only" htmlFor="quality-select">
                  Quality
                </label>
                <div className="relative">
                  <select
                    id="quality-select"
                    value={quality}
                    onChange={(e) => setQuality(e.target.value)}
                    className="h-9 appearance-none rounded-l-full border-y border-l border-border bg-card pl-3 pr-7 text-sm font-medium text-foreground outline-none focus:border-primary/50"
                  >
                    {qualities.map((q) => (
                      <option key={q.value} value={q.value}>
                        {q.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
                <button
                  onClick={() => setDialogOpen(true)}
                  className="flex h-9 items-center gap-1.5 rounded-r-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Download className="size-4" /> Download
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={() => setDescOpen((o) => !o)}
            className="mt-3 w-full rounded-xl bg-card p-3 text-left transition-colors hover:bg-muted/60"
          >
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span>{video.duration}</span>
              <span>·</span>
              <span>{video.platform}</span>
              <span className="ml-auto flex items-center gap-1 text-foreground">
                {descOpen ? 'Show less' : 'Show more'}
                <ChevronDown
                  className={`size-4 transition-transform ${descOpen ? 'rotate-180' : ''}`}
                />
              </span>
            </div>
            <p
              className={`mt-2 text-[13px] leading-relaxed text-foreground ${descOpen ? '' : 'line-clamp-2'}`}
            >
              {video.sourceUrl}
            </p>
          </button>
        </div>

        <aside className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <ListVideo className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Up next</h2>
          </div>
          <div className="flex flex-col gap-2">
            {upNext.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Search or load a topic to fill the up-next list.
              </div>
            ) : (
              upNext.map((v) => (
                <Link
                  key={v.id || v.sourceUrl}
                  href={watchHref(v)}
                  className="group flex gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-card"
                >
                  <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-lg bg-muted">
                    <img
                      src={v.thumbnail || '/placeholder.svg'}
                      alt={v.title}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-1 right-1 rounded bg-background/85 px-1 py-0.5 text-[10px] font-medium tabular-nums text-foreground">
                      {v.duration}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 py-0.5">
                    <h3 className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground group-hover:text-primary">
                      {v.title}
                    </h3>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {v.channel}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {v.platform}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </aside>
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
          qualities={qualities}
          onClose={() => setDialogOpen(false)}
          onConfirm={confirmDownload}
        />
      )}
    </div>
  )
}
