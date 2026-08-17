'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  Check,
  ClipboardPaste,
  Camera,
  Download,
  Eye,
  Link2,
  Loader2,
  MonitorPlay,
  Music2,
  Video,
} from 'lucide-react'
import { useDownloads } from '@/components/download-store'
import { QualityDialog } from '@/components/quality-dialog'
import {
  extractHttpUrl,
  fetchVideoInfo,
  type MediaVideo,
  type QualityOption,
} from '@/lib/backend-api'
import { cn } from '@/lib/utils'

type Platform = {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  hint: string
}

const PLATFORMS: Platform[] = [
  { id: 'auto', label: 'Auto-detect', icon: Link2, hint: 'youtube.com, bilibili.tv, …' },
  { id: 'youtube', label: 'YouTube', icon: MonitorPlay, hint: 'youtube.com / youtu.be' },
  { id: 'instagram', label: 'Instagram', icon: Camera, hint: 'instagram.com/reel/…' },
  { id: 'tiktok', label: 'TikTok', icon: Music2, hint: 'tiktok.com/@user/video/…' },
  { id: 'facebook', label: 'Facebook', icon: Video, hint: 'facebook.com/watch/…' },
  { id: 'bilibili', label: 'BiliBili', icon: MonitorPlay, hint: 'bili.im / bilibili.tv' },
]

type Preview = {
  video: MediaVideo
  qualities: QualityOption[]
}

function isValidUrl(value: string) {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function DownloaderView() {
  const params = useSearchParams()
  const { startDownload, downloads, setPanelOpen } = useDownloads()

  const [platform, setPlatform] = useState('auto')
  const [url, setUrl] = useState(() => {
    const initial = params.get('url') ?? ''
    return extractHttpUrl(initial) || initial
  })
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  )
  const [preview, setPreview] = useState<Preview | null>(null)
  const [quality, setQuality] = useState('best')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  async function fetchPreview() {
    const cleanUrl = extractHttpUrl(url)
    if (!isValidUrl(cleanUrl)) {
      setStatus('error')
      setPreview(null)
      setError('Enter a valid URL starting with http:// or https://')
      setSuccess('')
      return
    }
    setStatus('loading')
    setPreview(null)
    setError('')
    setSuccess('')
    setUrl(cleanUrl)

    try {
      const video = await fetchVideoInfo(cleanUrl)
      const qualities = video.qualities ?? []
      const preferred = video.platform === 'YouTube'
        ? qualities.find((option) => option.value === '1080') ?? qualities[0]
        : { value: 'best', label: 'Best available', note: 'Source selected', size: 'Automatic' }

      setPreview({ video, qualities })
      setQuality(preferred.value)
      setStatus('ready')
      setSuccess('Video details loaded from the backend.')
    } catch (err) {
      setPreview(null)
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Could not fetch video.')
      setSuccess('')
    }
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setUrl(extractHttpUrl(text) || text.trim())
        setSuccess('')
      }
    } catch {
      // Clipboard permission denied — ignore silently.
    }
  }

  function confirmDownload(q: QualityOption) {
    if (!preview) return
    setSuccess('Download queued. Track progress in the downloads panel.')
    startDownload({
      title: preview.video.title,
      channel: preview.video.channel,
      thumbnail: preview.video.thumbnail,
      quality: q.label,
      qualityValue: q.value,
      size: q.size,
      source: preview.video.platform,
      sourceUrl: preview.video.sourceUrl,
    })
  }

  const recent = downloads.slice(0, 5)
  const myFiles = downloads.filter((download) => download.status === 'completed')

  return (
    <div className="mx-auto w-full max-w-[1100px] px-3 py-5 sm:px-5">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Link2 className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Direct Link Downloader
            </h1>
            <p className="text-sm text-muted-foreground">
              Paste a link from any supported platform and grab it in your
              chosen quality.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Left: form + preview */}
        <div className="space-y-3">
          {/* Step 1: platform */}
          <section className="rounded-2xl border border-border bg-card p-4">
            <StepLabel n={1} title="Choose platform" />
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {PLATFORMS.map((p) => {
                const Icon = p.icon
                const active = platform === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => setPlatform(p.id)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-colors',
                      active
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-border hover:bg-muted',
                    )}
                  >
                    <Icon
                      className={cn(
                        'size-5',
                        active ? 'text-primary' : 'text-muted-foreground',
                      )}
                    />
                    <span className="text-xs font-medium text-foreground">
                      {p.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Step 2: paste url */}
          <section className="rounded-2xl border border-border bg-card p-4">
            <StepLabel n={2} title="Paste URL" />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <div
                className={cn(
                  'flex h-11 flex-1 items-center gap-2 rounded-xl border bg-background px-3 transition-colors',
                  status === 'error'
                    ? 'border-destructive/60'
                    : 'border-border focus-within:border-primary/50',
                )}
              >
                <Link2 className="size-4 shrink-0 text-muted-foreground" />
                <input
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value)
                    setSuccess('')
                    if (status === 'error') {
                      setStatus('idle')
                      setError('')
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing)
                      fetchPreview()
                  }}
                  inputMode="url"
                  placeholder="Paste a video link here…"
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                <button
                  onClick={pasteFromClipboard}
                  className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ClipboardPaste className="size-3.5" /> Paste
                </button>
              </div>
              <button
                onClick={fetchPreview}
                disabled={status === 'loading'}
                className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-70"
              >
                {status === 'loading' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Eye className="size-4" />
                )}
                Fetch
              </button>
            </div>
            {status === 'error' && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="size-3.5" />
                {error || 'Could not fetch video.'}
              </p>
            )}
            {success && status !== 'error' && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
                <Check className="size-3.5" />
                {success}
              </p>
            )}
          </section>

          {/* Step 3: preview + quality */}
          <section className="rounded-2xl border border-border bg-card p-4">
            <StepLabel n={3} title="Preview & download" />

            {status === 'idle' && (
              <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
                <Eye className="size-6 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  No preview yet
                </p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Paste a link and hit Fetch to load the video details here.
                </p>
              </div>
            )}

            {status === 'loading' && (
              <div className="mt-3 flex animate-pulse gap-3 rounded-xl border border-border p-3">
                <div className="aspect-video w-44 shrink-0 rounded-lg bg-muted" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                  <div className="h-3 w-1/3 rounded bg-muted" />
                </div>
              </div>
            )}

            {status === 'ready' && preview && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row">
                  <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:w-44">
                    <img
                      src={preview.video.thumbnail || '/placeholder.svg'}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-1 right-1 rounded bg-background/85 px-1 py-0.5 text-[10px] font-medium tabular-nums text-foreground">
                      {preview.video.duration}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                      <Check className="size-3" /> Detected ·{' '}
                      {preview.video.platform}
                    </span>
                    <p className="mt-1.5 line-clamp-2 text-sm font-medium text-foreground">
                      {preview.video.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {preview.video.channel}
                    </p>
                  </div>
                </div>

                {preview.video.platform === 'YouTube' ? (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Quality</p>
                    <div className="flex flex-wrap gap-1.5">
                      {preview.qualities.map((q) => (
                        <button key={q.value} onClick={() => setQuality(q.value)} className={cn(
                          'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                          quality === q.value ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}>
                          {q.label}<span className="ml-1 text-[10px] opacity-70">{q.size}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    Best available quality will be downloaded automatically.
                  </p>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={() => {
                      const q = preview.video.platform === 'YouTube'
                        ? preview.qualities.find((x) => x.value === quality) ?? preview.qualities[0]
                        : { value: 'best', label: 'Best available', note: 'Source selected', size: 'Automatic' }
                      if (q) confirmDownload(q)
                    }}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <Download className="size-4" /> Start download
                  </button>
                  {preview.video.platform === 'YouTube' && <button
                    onClick={() => setDialogOpen(true)}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >More options</button>}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right: sidebar */}
        <aside className="space-y-3">
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="size-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">
                  My Files
                </h2>
              </div>
              {downloads.length > 0 && (
                <button
                  onClick={() => setPanelOpen(true)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View all
                </button>
              )}
            </div>
            <div className="mt-2 space-y-1">
              {myFiles.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  Completed videos will appear here after they finish downloading.
                </p>
              ) : (
                myFiles.map((d) => (
                  <div key={d.id} className="flex items-center gap-2.5 py-1">
                    <div className="h-9 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                      <img
                        src={d.thumbnail || '/placeholder.svg'}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-xs font-medium text-foreground">
                        {d.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {d.quality} · {d.source}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 text-[11px] font-medium tabular-nums',
                        d.status === 'completed'
                          ? 'text-success'
                          : 'text-primary',
                      )}
                    >
                      {d.status === 'completed'
                        ? 'Ready'
                        : `${Math.round(d.progress)}%`}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">
              Supported sources
            </h2>
            <ul className="mt-2 space-y-1.5">
              {PLATFORMS.filter((p) => p.id !== 'auto').map((p) => {
                const Icon = p.icon
                return (
                  <li
                    key={p.id}
                    className="flex items-center gap-2.5 text-[13px] text-muted-foreground"
                  >
                    <Icon className="size-4 text-foreground" />
                    <span className="font-medium text-foreground">
                      {p.label}
                    </span>
                    <span className="ml-auto truncate text-[11px]">
                      {p.hint}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        </aside>
      </div>

      {dialogOpen && (
        <QualityDialog
          open={dialogOpen}
          target={
            preview
              ? {
                  title: preview.video.title,
                  channel: preview.video.channel,
                  thumbnail: preview.video.thumbnail,
                  source: preview.video.platform,
                }
              : null
          }
          qualities={preview?.qualities ?? []}
          onClose={() => setDialogOpen(false)}
          onConfirm={confirmDownload}
        />
      )}
    </div>
  )
}

function StepLabel({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-5 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-foreground">
        {n}
      </span>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
    </div>
  )
}
