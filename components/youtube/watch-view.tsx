'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ChevronDown,
  Download,
  ListVideo,
  Pause,
  Play,
  Settings,
  Share2,
  ThumbsUp,
  Volume2,
} from 'lucide-react'
import { useDownloads } from '@/components/download-store'
import { QualityDialog } from '@/components/quality-dialog'
import { QUALITIES, VIDEOS, type Video } from '@/lib/mock-data'

export function WatchView({ video }: { video: Video }) {
  const { startDownload } = useDownloads()
  const [playing, setPlaying] = useState(false)
  const [quality, setQuality] = useState('1080p')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [descOpen, setDescOpen] = useState(false)

  const upNext = VIDEOS.filter((v) => v.id !== video.id).slice(0, 8)

  function confirmDownload(q: string, size: string) {
    startDownload({
      title: video.title,
      channel: video.channel,
      thumbnail: video.thumbnail,
      quality: q,
      qualityValue: q === 'Audio' ? 'audio' : q.replace(/p$/i, ''),
      size,
      source: 'YouTube',
      sourceUrl: `https://www.youtube.com/watch?v=${video.id}`,
    })
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Player column */}
        <div className="min-w-0">
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
            <img
              src={video.thumbnail || '/placeholder.svg'}
              alt=""
              className="h-full w-full object-cover opacity-70"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? 'Pause' : 'Play'}
                className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform hover:scale-105"
              >
                {playing ? (
                  <Pause className="size-7 fill-current" />
                ) : (
                  <Play className="size-7 translate-x-0.5 fill-current" />
                )}
              </button>
            </div>
            {/* Controls bar */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
              <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: playing ? '34%' : '8%' }}
                />
              </div>
              <div className="flex items-center gap-3 text-white">
                <button
                  onClick={() => setPlaying((p) => !p)}
                  aria-label={playing ? 'Pause' : 'Play'}
                >
                  {playing ? (
                    <Pause className="size-5 fill-current" />
                  ) : (
                    <Play className="size-5 fill-current" />
                  )}
                </button>
                <Volume2 className="size-5" />
                <span className="text-xs tabular-nums text-white/90">
                  {playing ? '08:24' : '00:00'} / {video.duration}
                </span>
                <div className="ml-auto flex items-center gap-3">
                  <span className="rounded bg-white/15 px-1.5 py-0.5 text-[11px] font-medium">
                    {quality}
                  </span>
                  <Settings className="size-5" />
                </div>
              </div>
            </div>
          </div>

          {/* Title + meta */}
          <h1 className="mt-3 text-lg font-semibold leading-snug text-foreground text-balance sm:text-xl">
            {video.title}
          </h1>

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
                  {video.views} · {video.published}
                </p>
              </div>
              <button className="ml-2 h-9 rounded-full bg-foreground px-4 text-sm font-semibold text-background transition-opacity hover:opacity-90">
                Subscribe
              </button>
            </div>

            <div className="flex items-center gap-2 sm:ml-auto">
              <button className="flex h-9 items-center gap-1.5 rounded-full bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                <ThumbsUp className="size-4" /> 24K
              </button>
              <button className="flex h-9 items-center gap-1.5 rounded-full bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                <Share2 className="size-4" /> Share
              </button>

              {/* Quality selector + download */}
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
                    {QUALITIES.map((q) => (
                      <option key={q.label} value={q.label}>
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

          {/* Description */}
          <button
            onClick={() => setDescOpen((o) => !o)}
            className="mt-3 w-full rounded-xl bg-card p-3 text-left transition-colors hover:bg-muted/60"
          >
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span>{video.views}</span>
              <span>·</span>
              <span>{video.published}</span>
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
              {video.description} This upload is part of the {video.category}{' '}
              collection on {video.channel}. Use the quality selector above to
              choose your preferred resolution before downloading — the file is
              added to your downloads panel and stays there once complete.
            </p>
          </button>
        </div>

        {/* Up next */}
        <aside className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <ListVideo className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Up next</h2>
          </div>
          <div className="flex flex-col gap-2">
            {upNext.map((v) => (
              <Link
                key={v.id}
                href={`/youtube/watch/${v.id}`}
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
                    {v.views}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </aside>
      </div>

      <QualityDialog
        open={dialogOpen}
        target={{
          title: video.title,
          channel: video.channel,
          thumbnail: video.thumbnail,
          source: 'YouTube',
        }}
        onClose={() => setDialogOpen(false)}
        onConfirm={confirmDownload}
      />
    </div>
  )
}
