'use client'

import { useEffect, useState } from 'react'
import { Check, Download, Music, Video, X } from 'lucide-react'
import { QUALITIES } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

export type QualityTarget = {
  title: string
  channel: string
  thumbnail: string
  source: string
}

export function QualityDialog({
  open,
  target,
  onClose,
  onConfirm,
}: {
  open: boolean
  target: QualityTarget | null
  onClose: () => void
  onConfirm: (quality: string, size: string) => void
}) {
  const [selected, setSelected] = useState('1080p')

  useEffect(() => {
    if (open) setSelected('1080p')
  }, [open])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !target) return null

  const chosen = QUALITIES.find((q) => q.label === selected) ?? QUALITIES[2]

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Choose download quality"
    >
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="animate-in slide-in-from-bottom-4 fade-in relative z-10 w-full max-w-md overflow-hidden rounded-t-2xl border border-border bg-popover shadow-2xl duration-200 sm:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-border p-4">
          <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
            <img
              src={target.thumbnail || '/placeholder.svg'}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-medium leading-snug text-popover-foreground">
              {target.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {target.channel} · {target.source}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-2">
          <p className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Select quality
          </p>
          <div className="max-h-[46vh] space-y-1 overflow-y-auto px-1 pb-1">
            {QUALITIES.map((q) => {
              const isAudio = q.label === 'Audio'
              const active = selected === q.label
              return (
                <button
                  key={q.label}
                  onClick={() => setSelected(q.label)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                    active
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-transparent hover:bg-muted',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-md',
                      active
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {isAudio ? (
                      <Music className="size-4" />
                    ) : (
                      <Video className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      {q.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {q.note}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {q.size}
                  </span>
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full border',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border',
                    )}
                  >
                    {active && <Check className="size-3" />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border p-3">
          <button
            onClick={onClose}
            className="h-10 flex-1 rounded-lg border border-border text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm(chosen.label, chosen.size)
              onClose()
            }}
            className="flex h-10 flex-[1.6] items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Download className="size-4" />
            Download {chosen.label} · {chosen.size}
          </button>
        </div>
      </div>
    </div>
  )
}
