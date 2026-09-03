'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Download, Music, Video, X } from 'lucide-react'
import { normalizeQualityOptions, normalizeQualityValue, resolvePreferredQuality, shouldInitializeQualitySelection, type QualityOption } from '@/lib/quality-preferences'
import { cn } from '@/lib/utils'

export type QualityTarget = {
  title: string
  channel: string
  thumbnail: string
  source: string
  sourceUrl?: string
  qualities?: QualityOption[]
}

export function QualityDialog({
  open,
  initialQuality = 'best',
  target,
  onClose,
  onConfirm,
}: {
  open: boolean
  initialQuality?: string
  target: QualityTarget | null
  onClose: () => void
  onConfirm: (quality: string, size: string) => void
}) {
  const [selected, setSelected] = useState('')
  const initializedIdentity = useRef('')

  const options = useMemo(() => normalizeQualityOptions(target?.qualities || []), [target?.qualities])
  const targetIdentity = target?.sourceUrl || target?.title || ''

  useEffect(() => {
    if (!open) {
      initializedIdentity.current = ''
      return
    }
    if (!shouldInitializeQualitySelection(initializedIdentity.current, targetIdentity)) return

    const preferred = normalizeQualityValue(initialQuality)
    const next = options.length ? resolvePreferredQuality(options, preferred) : 'best'
    setSelected(next)
    initializedIdentity.current = targetIdentity
  }, [initialQuality, open, options, targetIdentity])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !target) return null

  const displayOptions = options.length ? options : [{value:'best',label:'Best available',extension:'mp4',filesize:null,size:'Estimated size'}]
  const fallbackValue = resolvePreferredQuality(displayOptions, 'ask')
  const chosen = displayOptions.find((q) => q.value === selected) ?? displayOptions.find(q => q.value === fallbackValue) ?? displayOptions[displayOptions.length - 1]

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Choose download quality"
    >
      <div
        className="modal-backdrop absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="modal-content relative z-10 w-full max-w-md overflow-hidden rounded-t-2xl border border-border glass-panel shadow-2xl sm:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-border p-4">
          <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
            <img
              src={target.thumbnail || '/placeholder.svg'}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
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
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-all duration-300 hover:bg-muted hover:text-foreground hover:rotate-90 active:scale-90"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-2">
          <p className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Select quality
          </p>
          <div className="max-h-[46vh] space-y-1 overflow-y-auto px-1 pb-1 smooth-scroll">
            {displayOptions.map((q, i) => {
              const isAudio = q.value === 'audio'
              const active = selected === q.value
              return (
                <button
                  key={q.value}
                  onClick={() => setSelected(q.value)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all duration-300',
                    active
                      ? 'border-primary/60 bg-primary/10 shadow-sm shadow-primary/10'
                      : 'border-transparent hover:bg-muted',
                  )}
                  style={{ animationDelay: `${i * 40}ms`, animation: 'fade-up 0.35s var(--ease-spring) both' }}
                >
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-md transition-all duration-300',
                      active
                        ? 'bg-primary/20 text-primary scale-110'
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
                      {q.extension.toUpperCase()}{q.filesize ? ` · ${Math.round(q.filesize / 1024 / 1024)} MB` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {q.size}
                  </span>
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full border transition-all duration-300',
                      active
                        ? 'border-primary bg-primary text-primary-foreground scale-110'
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
            className="h-10 flex-1 rounded-lg border border-border text-sm font-medium text-foreground transition-all duration-300 hover:bg-muted active:scale-[0.98]"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm(chosen.value, chosen.size)
              onClose()
            }}
            className="flex h-10 flex-[1.6] items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-all duration-300 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98]"
          >
            <Download className="size-4" />
            Download {chosen.label} · {chosen.size}
          </button>
        </div>
      </div>
    </div>
  )
}
