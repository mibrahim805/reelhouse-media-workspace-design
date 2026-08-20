'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Ban, Download, ExternalLink,
  FileVideo, Maximize, MoreVertical,
  Pause, Play, RotateCcw, Trash2, Volume2
} from 'lucide-react'
import { type DownloadItem, useDownloads } from '@/components/download-store'
import { useMedia } from '@/components/media-state'

/* ─── Shared ─── */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 sm:px-5">
      {children}
    </main>
  )
}

function PageHeader({
  title, subtitle, back = false, action,
}: {
  title: string; subtitle?: string; back?: boolean; action?: React.ReactNode
}) {
  const router = useRouter()
  return (
    <header className="mb-5 flex min-h-11 items-center gap-3">
      {back && (
        <button
          onClick={() => router.back()}
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#292929] bg-[#151515] text-[#a3a3a3] hover:text-white"
          aria-label="Go back"
        >
          <ArrowLeft className="size-4" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-[24px] font-bold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-[#a3a3a3]">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-[#292929] px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-[#151515]">
        <FileVideo className="size-5 text-[#a3a3a3]" />
      </span>
      <h2 className="mt-4 font-semibold text-white">{title}</h2>
      <p className="mt-1 max-w-xs text-sm text-[#a3a3a3]">{text}</p>
      <Link href="/downloader" className="mt-5 flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white">
        Analyze a link
      </Link>
    </div>
  )
}

const ACTIVE_STATUSES = ['queued', 'downloading', 'processing']
const IN_PROGRESS_STATUSES = ['queued', 'downloading', 'processing', 'failed', 'canceled', 'interrupted']

function statusRank(status: DownloadItem['status']) {
  if (status === 'downloading') return 0
  if (status === 'processing') return 1
  if (status === 'queued') return 2
  return 3
}

/* ── 13/15 Downloads Hub ── */
export function DownloadsHub() {
  const { downloads } = useDownloads()
  const [expanded, setExpanded] = useState(false)
  const inProgress = downloads
    .filter(item => IN_PROGRESS_STATUSES.includes(item.status))
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.startedAt - a.startedAt)
  const completed = downloads
    .filter(item => item.status === 'completed')
    .sort((a, b) => b.startedAt - a.startedAt)
  const visibleInProgress = expanded ? inProgress : inProgress.slice(0, 3)

  return (
    <Shell>
      <PageHeader title="Downloads" subtitle={`${inProgress.length} in progress · ${completed.length} completed`} />

      {inProgress.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[18px] font-semibold tracking-tight text-white">Downloading ({inProgress.length})</h2>
            {inProgress.length > 3 && (
              <button type="button" onClick={() => setExpanded(value => !value)} className="text-xs font-semibold text-primary">
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
          <div className="space-y-2.5">
            {visibleInProgress.map(item => <ActiveCard key={item.id} item={item} />)}
          </div>
        </section>
      )}

      <section className={inProgress.length > 0 ? 'mt-8' : ''}>
        <h2 className="mb-3 text-[18px] font-semibold tracking-tight text-white">Completed</h2>
        {completed.length > 0 ? (
          <div className="space-y-2.5">
            {completed.map(item => <CompletedCard key={item.id} item={item} />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#292929] px-5 py-10 text-center">
            <FileVideo className="mx-auto size-7 text-[#737373]" />
            <h2 className="mt-3 text-sm font-semibold text-white">No downloads yet</h2>
            <p className="mt-1 text-xs text-[#a3a3a3]">Videos you download will appear here.</p>
          </div>
        )}
      </section>
    </Shell>
  )
}

function ActiveCard({ item }: { item: DownloadItem }) {
  const { cancelDownload, retryDownload, removeDownload } = useDownloads()
  const failed = ['failed', 'interrupted', 'canceled'].includes(item.status)
  const format = item.filename?.split('.').pop()?.toUpperCase()
  const mediaInfo = [item.quality, format].filter(Boolean).join(' · ')
  const statusText = item.status === 'processing'
    ? 'Processing…'
    : item.status === 'queued'
      ? 'Waiting…'
      : item.status === 'downloading'
        ? `${Math.round(item.progress)}%`
        : item.status === 'canceled'
          ? 'Canceled'
          : item.status === 'interrupted'
            ? 'Interrupted'
            : 'Download failed'

  return (
    <article className="rounded-2xl border border-[#292929] bg-[#151515] p-3">
      <div className="flex gap-3">
        <img src={item.thumbnail || '/placeholder.svg'} alt="" className="h-16 w-24 shrink-0 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-white">{item.title}</h2>
              {mediaInfo && <p className="mt-1 text-[11px] text-[#a3a3a3]">{mediaInfo}</p>}
            </div>
            <span className={`shrink-0 text-xs font-bold ${failed ? 'text-red-400' : 'text-primary'}`}>{statusText}</span>
          </div>
          {!failed && (
            <>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#1d1d1d]">
                <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(item.progress, 100))}%` }} />
              </div>
              <div className="mt-1.5 flex gap-2 text-[11px] text-[#a3a3a3]">
                <span>{item.status === 'processing' ? 'Processing…' : item.speed != null ? formatSpeed(item.speed) : 'Waiting…'}</span>
                {item.eta != null && <span>· {formatTime(item.eta)} remaining</span>}
              </div>
            </>
          )}
          {failed && item.error && <p className="mt-1 line-clamp-1 text-[11px] text-red-400">{item.error}</p>}
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        {ACTIVE_STATUSES.includes(item.status) && (
          <button onClick={() => cancelDownload(item.id)} className="flex h-8 items-center gap-1.5 rounded-lg border border-[#292929] bg-[#1d1d1d] px-2.5 text-xs font-medium text-red-400">
            <Ban className="size-3.5" /> Cancel
          </button>
        )}
        {failed && (
          <>
            <button onClick={() => retryDownload(item.id)} className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-semibold text-white">
              <RotateCcw className="size-3.5" /> Retry
            </button>
            <button onClick={() => removeDownload(item.id)} aria-label="Remove download" className="flex size-8 items-center justify-center rounded-lg border border-[#292929] bg-[#1d1d1d] text-[#a3a3a3]">
              <Trash2 className="size-3.5" />
            </button>
          </>
        )}
      </div>
    </article>
  )
}

function CompletedCard({ item }: { item: DownloadItem }) {
  const { open } = useMedia()
  const [menuOpen, setMenuOpen] = useState(false)
  const format = item.filename?.split('.').pop()?.toUpperCase()
  const mediaInfo = [item.quality, format, item.size].filter(Boolean).join(' · ')

  return (
    <article className="relative flex gap-3 rounded-2xl border border-[#292929] bg-[#151515] p-3">
      <button onClick={() => open(item)} className="group relative h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-[#1d1d1d] sm:h-20 sm:w-28">
        <img src={item.thumbnail || '/placeholder.svg'} alt="" className="size-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="size-5 fill-white text-white" />
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <h2 className="line-clamp-2 text-sm font-semibold text-white">{item.title}</h2>
        {mediaInfo && <p className="mt-1 line-clamp-2 text-xs text-[#a3a3a3]">{mediaInfo}</p>}
        <p className="mt-1 text-[11px] text-[#737373]">{new Date(item.startedAt).toLocaleDateString()}</p>
      </div>
      <button type="button" onClick={() => setMenuOpen(value => !value)} aria-label={`More actions for ${item.title}`} className="flex size-8 shrink-0 items-center justify-center self-start rounded-lg text-[#a3a3a3] hover:bg-[#1d1d1d] hover:text-white">
        <MoreVertical className="size-4" />
      </button>
      {menuOpen && (
        <div className="absolute right-3 top-11 z-10 w-32 rounded-xl border border-[#292929] bg-[#1d1d1d] p-1 shadow-xl">
          <Link href={`/downloads/${item.id}`} onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-xs text-white hover:bg-[#292929]">Details</Link>
          <button type="button" onClick={() => { setMenuOpen(false); open(item) }} className="block w-full rounded-lg px-3 py-2 text-left text-xs text-white hover:bg-[#292929]">Play</button>
        </div>
      )}
    </article>
  )
}

/* ── 14 Queue ── */
export function QueueView() {
  const { downloads } = useDownloads()
  const queued = downloads.filter(d =>
    ['queued', 'downloading', 'processing', 'failed', 'interrupted', 'canceled'].includes(d.status),
  )
  return (
    <Shell>
      <PageHeader title="Download Queue" subtitle="Backend worker order and current job states" back />
      {queued.length ? (
        <div className="space-y-3">
          {queued.map((item, index) => (
            <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-[#292929] bg-[#151515] p-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#1d1d1d] text-xs font-bold text-white">
                {index + 1}
              </span>
              <img src={item.thumbnail || '/placeholder.svg'} alt="" className="h-14 w-20 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                <p className="mt-0.5 text-xs capitalize text-[#a3a3a3]">
                  {item.status}{item.status === 'downloading' ? ` · ${Math.round(item.progress)}%` : ''}
                </p>
              </div>
              <StatusPill status={item.status} progress={item.progress} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Queue is empty" text="Queued, processing, canceled, and failed jobs will be shown here." />
      )}
    </Shell>
  )
}

function StatusPill({ status, progress }: { status: string; progress: number }) {
  const color =
    status === 'completed' ? 'bg-emerald-500/15 text-emerald-400' :
    status === 'failed' || status === 'canceled' ? 'bg-red-500/15 text-red-400' :
    status === 'downloading' ? 'bg-primary/15 text-primary' :
    'bg-[#1d1d1d] text-[#a3a3a3]'
  const label = status === 'downloading' ? `${Math.round(progress)}%` : status
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${color}`}>
      {label}
    </span>
  )
}

/* ── 16 Download Details ── */
export function DownloadDetails() {
  const params = useParams<{ id: string }>()
  const { downloads, removeDownload, saveDownload } = useDownloads()
  const { open } = useMedia()
  const router = useRouter()
  const item = downloads.find(d => d.id === params.id)
  if (!item) {
    return (
      <Shell>
        <PageHeader title="Download Details" back />
        <EmptyState title="Download not found" text="It may have been removed from local history." />
      </Shell>
    )
  }
  const fields = [
    ['Filename', item.filename || 'Pending'],
    ['Source', item.source],
    ['Quality', item.quality],
    ['Format', item.filename?.split('.').pop()?.toUpperCase() || 'Unknown'],
    ['File size', item.size],
    ['Downloaded', new Date(item.startedAt).toLocaleString()],
    ['Media URL', item.fileUrl || 'Unavailable'],
  ]
  return (
    <Shell>
      <PageHeader title="Download Details" back />
      <div className="mx-auto max-w-2xl">
        <div className="aspect-video overflow-hidden rounded-3xl bg-[#151515]">
          <img src={item.thumbnail || '/placeholder.svg'} alt="" className="size-full object-cover" />
        </div>
        <h2 className="mt-5 text-xl font-bold text-white">{item.title}</h2>
        <div className="mt-5 overflow-hidden rounded-2xl border border-[#292929] bg-[#151515]">
          {fields.map(([label, value]) => (
            <div key={label} className="flex gap-4 border-b border-[#292929] px-4 py-3 last:border-0">
              <span className="w-24 shrink-0 text-xs font-medium text-[#a3a3a3]">{label}</span>
              <span className="min-w-0 break-all text-sm text-white">{value}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          {item.fileUrl && (
            <button onClick={() => open(item)} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white">
              <Play className="size-4" /> Play
            </button>
          )}
          <button onClick={() => saveDownload(item.id)} disabled={!item.fileUrl} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#292929] bg-[#151515] text-sm font-semibold text-white disabled:opacity-40">
            <Download className="size-4" /> Save file
          </button>
          <button
            onClick={() => { removeDownload(item.id); router.push('/downloads') }}
            className="col-span-2 flex h-12 items-center justify-center gap-2 rounded-xl border border-[#292929] bg-[#151515] text-sm font-semibold text-destructive"
          >
            <Trash2 className="size-4" /> Remove from history
          </button>
        </div>
      </div>
    </Shell>
  )
}

/* ── 17 Video Player ── */
export function RealVideoPlayer() {
  const params = useParams<{ id: string }>()
  const { downloads } = useDownloads()
  const { open, setPlaying: setGlobalPlaying } = useMedia()
  const router = useRouter()
  const item = downloads.find(d => d.id === params.id)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [showControls, setShowControls] = useState(true)
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (item) open(item)
  }, [item, open])

  function resetControlsTimer() {
    setShowControls(true)
    if (controlsTimer.current) clearTimeout(controlsTimer.current)
    controlsTimer.current = setTimeout(() => setShowControls(false), 3000)
  }

  if (!item?.fileUrl) {
    return (
      <Shell>
        <PageHeader title="Player" back />
        <EmptyState title="Media unavailable" text="Only completed backend files can be played." />
      </Shell>
    )
  }

  const toggle = () => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) { void el.play(); setPlaying(true) }
    else { el.pause(); setPlaying(false) }
  }

  return (
    <div
      className="relative flex min-h-svh flex-col bg-black"
      onMouseMove={resetControlsTimer}
      onClick={resetControlsTimer}
    >
      {/* Video */}
      <div className="relative flex flex-1 items-center">
        <video
          ref={videoRef}
          src={item.fileUrl}
          poster={item.thumbnail || undefined}
          className="max-h-svh w-full"
          playsInline
          onTimeUpdate={e => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={e => setDuration(e.currentTarget.duration || 0)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />

        {/* Center play/pause tap */}
        <button
          onClick={toggle}
          className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 backdrop-blur-md"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause className="size-7 fill-white text-white" /> : <Play className="ml-1 size-7 fill-white text-white" />}
        </button>

        {/* Top bar */}
        <div className={`absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent p-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
          <button onClick={() => router.back()} className="flex size-9 items-center justify-center rounded-full bg-black/30 text-white" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{item.title}</p>
          <button onClick={() => videoRef.current?.requestPictureInPicture?.()} className="flex size-9 items-center justify-center rounded-full bg-black/30 text-white" aria-label="PiP">
            <ExternalLink className="size-4" />
          </button>
        </div>

        {/* Bottom controls */}
        <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
          <input
            type="range" min="0" max={duration || 0} value={time}
            onChange={e => { if (videoRef.current) videoRef.current.currentTime = Number(e.target.value) }}
            className="w-full accent-violet-500"
            aria-label="Seek"
          />
          <div className="mt-2 flex items-center gap-3 text-white">
            <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
            </button>
            <span className="text-xs tabular-nums">{formatTime(time)} / {formatTime(duration)}</span>
            <Volume2 className="ml-auto size-4" />
            <input
              type="range" min="0" max="1" step="0.05" value={volume}
              onChange={e => { const v = Number(e.target.value); setVolume(v); if (videoRef.current) videoRef.current.volume = v }}
              className="hidden w-20 accent-violet-500 sm:block"
              aria-label="Volume"
            />
            <button onClick={() => videoRef.current?.requestFullscreen()} aria-label="Fullscreen">
              <Maximize className="size-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* helpers */
function formatSpeed(v: number) {
  return v >= 1024 * 1024 ? `${(v / 1024 / 1024).toFixed(1)} MB/s` : `${Math.round(v / 1024)} KB/s`
}
function formatTime(v: number) {
  if (!Number.isFinite(v)) return '0:00'
  const m = Math.floor(v / 60)
  return `${m}:${Math.floor(v % 60).toString().padStart(2, '0')}`
}
