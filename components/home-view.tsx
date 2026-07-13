'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  Gauge,
  Link2,
  ListVideo,
  Play,
  MonitorPlay,
  Search,
  Sparkles,
} from 'lucide-react'
import { useDownloads } from '@/components/download-store'
import { VIDEOS } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

function isValidUrl(value: string) {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function HomeView() {
  const router = useRouter()
  const { downloads, activeCount, completedCount, setPanelOpen } =
    useDownloads()
  const [url, setUrl] = useState('')

  const valid = isValidUrl(url)

  function goDownloader() {
    if (valid) {
      router.push(`/downloader?url=${encodeURIComponent(url.trim())}`)
    } else {
      router.push('/downloader')
    }
  }

  const recent = downloads.slice(0, 4)

  return (
    <div className="mx-auto w-full max-w-[1600px] px-3 py-5 sm:px-5">
      {/* Intro */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1">
            <span className="size-1.5 rounded-full bg-success" />
            Workspace ready
          </span>
          <span className="hidden sm:inline">
            Search, watch, and download — all in one place
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance sm:text-3xl">
          Your media workspace
        </h1>
      </div>

      {/* Primary actions */}
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {/* YouTube workspace */}
        <button
          onClick={() => router.push('/youtube')}
          className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/40"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <MonitorPlay className="size-5" />
              </span>
              <h2 className="mt-3 text-lg font-semibold text-foreground">
                Open YouTube Workspace
              </h2>
              <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Browse a familiar feed, search with instant filters, watch, and
                queue downloads without leaving the page.
              </p>
            </div>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-all group-hover:bg-primary group-hover:text-primary-foreground">
              <ArrowRight className="size-4" />
            </span>
          </div>
          <div className="mt-5 flex -space-x-2">
            {VIDEOS.slice(0, 5).map((v) => (
              <div
                key={v.id}
                className="h-10 w-16 overflow-hidden rounded-md border-2 border-card bg-muted"
              >
                <img
                  src={v.thumbnail || '/placeholder.svg'}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
            <div className="flex h-10 items-center rounded-md pl-4 text-xs font-medium text-muted-foreground">
              Trending now
            </div>
          </div>
        </button>

        {/* Paste a link */}
        <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-foreground">
                <Link2 className="size-5" />
              </span>
              <h2 className="mt-3 text-lg font-semibold text-foreground">
                Paste a Link
              </h2>
              <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Drop a URL from YouTube, Instagram, TikTok, or Facebook. We
                detect the source and grab the best quality.
              </p>
            </div>
          </div>
          <div className="mt-5">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background p-1.5 focus-within:border-primary/50">
              <Link2 className="ml-1.5 size-4 shrink-0 text-muted-foreground" />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing)
                    goDownloader()
                }}
                inputMode="url"
                placeholder="https://…"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button
                onClick={goDownloader}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Continue
                <ArrowRight className="size-4" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {['YouTube', 'Instagram', 'TikTok', 'Facebook', 'Auto-detect'].map(
                (p) => (
                  <span
                    key={p}
                    className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {p}
                  </span>
                ),
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lower grid */}
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {/* Downloads status */}
        <section className="rounded-2xl border border-border bg-card p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Download className="size-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Downloads
              </h3>
            </div>
            <button
              onClick={() => setPanelOpen(true)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Open panel
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat
              icon={<Gauge className="size-4" />}
              label="Active"
              value={activeCount}
              tone="primary"
            />
            <Stat
              icon={<CheckCircle2 className="size-4" />}
              label="Completed"
              value={completedCount}
              tone="success"
            />
            <Stat
              icon={<ListVideo className="size-4" />}
              label="Total"
              value={downloads.length}
              tone="muted"
            />
          </div>

          <div className="mt-3 space-y-1">
            {recent.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                <Download className="size-4" />
                No downloads yet — start one from the workspace or paste a link.
              </div>
            ) : (
              recent.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-muted/60"
                >
                  <div className="h-10 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                    <img
                      src={d.thumbnail || '/placeholder.svg'}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-[13px] font-medium text-foreground">
                      {d.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {d.quality} · {d.size} · {d.source}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {d.status === 'completed' ? (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-success">
                        <CheckCircle2 className="size-3.5" /> Done
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium tabular-nums text-primary">
                        {Math.round(d.progress)}%
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Capabilities */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              What you can do
            </h3>
          </div>
          <ul className="mt-3 space-y-2.5">
            {[
              { icon: Search, text: 'Search a YouTube-style feed with filters' },
              { icon: Play, text: 'Watch with an up-next queue' },
              { icon: Download, text: 'Pick quality, then download' },
              { icon: Clock, text: 'Keep completed files in one panel' },
            ].map((f, i) => {
              const Icon = f.icon
              return (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary text-foreground">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="text-[13px] leading-snug text-muted-foreground">
                    {f.text}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'primary' | 'success' | 'muted'
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div
        className={cn(
          'flex items-center gap-1.5 text-xs font-medium',
          tone === 'primary' && 'text-primary',
          tone === 'success' && 'text-success',
          tone === 'muted' && 'text-muted-foreground',
        )}
      >
        {icon}
        {label}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  )
}
