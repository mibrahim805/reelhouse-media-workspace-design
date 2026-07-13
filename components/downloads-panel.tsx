'use client'

import {
  Check,
  Download,
  FolderOpen,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react'
import { type DownloadItem, useDownloads } from '@/components/download-store'
import { cn } from '@/lib/utils'

function StatusBadge({ item }: { item: DownloadItem }) {
  if (item.status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
        <Check className="size-3" /> Done
      </span>
    )
  }
  if (item.status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
        Failed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium tabular-nums text-primary">
      {Math.round(item.progress)}%
    </span>
  )
}

function DownloadRow({ item }: { item: DownloadItem }) {
  const { removeDownload, retryDownload } = useDownloads()
  return (
    <div className="flex gap-3 rounded-lg p-2 transition-colors hover:bg-muted/60">
      <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
        <img
          src={item.thumbnail || '/placeholder.svg'}
          alt=""
          className="h-full w-full object-cover"
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

        {item.status === 'downloading' && (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}

        {item.status !== 'downloading' && (
          <div className="mt-1.5 flex items-center gap-1">
            {item.status === 'completed' && (
              <button className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
                <FolderOpen className="size-3" /> Open
              </button>
            )}
            {item.status === 'failed' && (
              <button
                onClick={() => retryDownload(item.id)}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <RotateCw className="size-3" /> Retry
              </button>
            )}
            <button
              onClick={() => removeDownload(item.id)}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
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

  if (!panelOpen) return null

  const active = downloads.filter((d) => d.status === 'downloading')
  const others = downloads.filter((d) => d.status !== 'downloading')

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={() => setPanelOpen(false)}
        aria-hidden
      />
      <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,22rem)] origin-top-right animate-in fade-in slide-in-from-top-2 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl duration-150">
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
                className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Clear done
              </button>
            )}
            <button
              onClick={() => setPanelOpen(false)}
              aria-label="Close downloads"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-2">
          {downloads.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <div className="flex size-11 items-center justify-center rounded-full bg-muted">
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
                  <div className="space-y-0.5">
                    {active.map((d) => (
                      <DownloadRow key={d.id} item={d} />
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
                    className={cn('space-y-0.5', active.length > 0 && 'pt-0.5')}
                  >
                    {others.map((d) => (
                      <DownloadRow key={d.id} item={d} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
