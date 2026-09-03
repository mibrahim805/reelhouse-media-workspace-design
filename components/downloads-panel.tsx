'use client'

import { useState } from 'react'
import {
  Check,
  Download,
  Play,
  RotateCw,
  Ban,
  Trash2,
  X,
} from 'lucide-react'
import { type DownloadItem, useDownloads } from '@/components/download-store'
import { cn } from '@/lib/utils'

function StatusBadge({ item }: { item: DownloadItem }) {
  if (item.status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success transition-all duration-300">
        <Check className="size-3" /> Done
      </span>
    )
  }
  if (item.status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive transition-all duration-300">
        Failed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium tabular-nums text-primary transition-all duration-300">
      {Math.round(item.progress)}%
    </span>
  )
}

function DownloadRow({
  item,
  onPlay,
}: {
  item: DownloadItem
  onPlay: (item: DownloadItem) => void
}) {
  const { cancelDownload, removeDownload, retryDownload, saveDownload } = useDownloads()
  return (
    <div className="flex gap-3 rounded-lg p-2 transition-all duration-300 hover:bg-muted/60" style={{ animation: 'fade-up 0.4s var(--ease-spring) both' }}>
      <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
        <img
          src={item.thumbnail || '/placeholder.svg'}
          alt=""
          className="h-full w-full object-cover transition-transform duration-500 hover:scale-110"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-1 text-[13px] font-medium leading-tight text-foreground">
            {item.title}
          </p>
          <StatusBadge item={item} />
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {item.quality} · {item.size} · {item.source}
        </p>

        {['queued','downloading','processing'].includes(item.status) && (
          <>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="smooth-progress h-full rounded-full bg-primary"
              style={{ width: `${item.progress}%` }}
            />
          </div>
          <div className="mt-1 flex items-center text-[10px] text-muted-foreground">
            <span>{item.status === 'processing' ? 'Processing file…' : item.speed ? `${(item.speed / 1024 / 1024).toFixed(1)} MB/s` : item.status}</span>
            {item.eta != null && <span className="ml-auto">{item.eta}s remaining</span>}
            <button onClick={() => cancelDownload(item.id)} className="ml-2 text-destructive transition-all duration-200 hover:scale-110 active:scale-90"><Ban className="size-3" /></button>
          </div>
          </>
        )}

        {!['queued','downloading','processing'].includes(item.status) && (
          <div className="mt-1.5 flex items-center gap-1">
            {item.status === 'completed' && (
              <button
                onClick={() => onPlay(item)}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-primary transition-all duration-300 hover:bg-primary/10 active:scale-95"
              >
              <Play className="size-3 fill-current" /> Play
              </button>
            )}
            {item.status === 'completed' && item.fileUrl && <button onClick={() => saveDownload(item.id)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-primary transition-all duration-300 hover:bg-primary/10 active:scale-95"><Download className="size-3"/> Save</button>}
            {['failed','interrupted','canceled'].includes(item.status) && (
              <button
                onClick={() => retryDownload(item.id)}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-primary transition-all duration-300 hover:bg-primary/10 active:scale-95"
              >
              <RotateCw className="size-3" /> Retry
              </button>
            )}
            <button
              onClick={() => removeDownload(item.id)}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-all duration-300 hover:bg-background hover:text-foreground active:scale-95"
            >
              <Trash2 className="size-3" /> Remove
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function DownloadsPanel() {
  const { downloads, panelOpen, setPanelOpen, clearCompleted, completedCount } =
    useDownloads()
  const [playing, setPlaying] = useState<DownloadItem | null>(null)

  if (!panelOpen) return null

  const active = downloads.filter((d) => ['queued','downloading','processing'].includes(d.status))
  const others = downloads.filter((d) => !['queued','downloading','processing'].includes(d.status))

  return (
    <>
      <div
        className="modal-backdrop fixed inset-0 z-40"
        onClick={() => setPanelOpen(false)}
        aria-hidden
      />
      <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,22rem)] origin-top-right overflow-hidden rounded-xl border border-border glass-panel shadow-2xl modal-content">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Download className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-popover-foreground">
              Downloads
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {completedCount > 0 && (
              <button
                onClick={clearCompleted}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-all duration-300 hover:bg-muted hover:text-foreground active:scale-95"
              >
                Clear done
              </button>
            )}
            <button
              onClick={() => setPanelOpen(false)}
              aria-label="Close downloads"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-all duration-300 hover:bg-muted hover:text-foreground hover:rotate-90 active:scale-90"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-2 smooth-scroll">
          {downloads.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center" style={{ animation: 'fade-in-scale 0.4s var(--ease-spring) both' }}>
              <div className="float-gentle flex size-11 items-center justify-center rounded-full bg-muted">
                <Download className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">
                No downloads yet
              </p>
              <p className="max-w-[16rem] text-xs text-muted-foreground">
                Start a download from the workspace or paste a link. Progress
                shows up here and completed files stay for later.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {active.length > 0 && (
                <div>
                  <p className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Active · {active.length}
                  </p>
                  <div className="space-y-0.5 stagger-children">
                    {active.map((d) => (
                      <DownloadRow key={d.id} item={d} onPlay={setPlaying} />
                    ))}
                  </div>
                </div>
              )}
              {others.length > 0 && (
                <div>
                  <p className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {active.length > 0 ? 'Completed' : 'Recent'}
                  </p>
                  <div
                    className={cn('space-y-0.5 stagger-children', active.length > 0 && 'pt-0.5')}
                  >
                    {others.map((d) => (
                      <DownloadRow key={d.id} item={d} onPlay={setPlaying} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {playing && (
        <div className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
          <div className="modal-content w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <p className="truncate text-sm font-semibold text-foreground">{playing.title}</p>
              <button
                onClick={() => setPlaying(null)}
                aria-label="Close video player"
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-all duration-300 hover:bg-muted hover:text-foreground hover:rotate-90 active:scale-90"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="aspect-video bg-black">
              {playing.fileUrl ? (
                <video
                  src={playing.fileUrl}
                  poster={playing.thumbnail || undefined}
                  controls
                  autoPlay
                  className="h-full w-full"
                />
              ) : (
                <div className="relative flex h-full items-center justify-center">
                  <img src={playing.thumbnail || '/placeholder.svg'} alt="" className="absolute h-full w-full object-cover opacity-40" />
                  <p className="relative rounded-lg bg-background/90 px-4 py-3 text-center text-sm text-foreground" style={{ animation: 'fade-in-scale 0.4s var(--ease-spring) both' }}>
                    The downloaded video file is not available in this session.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
