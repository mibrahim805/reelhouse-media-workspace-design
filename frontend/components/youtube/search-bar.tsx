'use client'

import { useEffect, useRef, useState } from 'react'
import { Clock, Search, TrendingUp, X } from 'lucide-react'
import { useSearch } from '@/components/youtube/search-store'
import { YOUTUBE_TOPICS } from '@/lib/backend-api'
import { cn } from '@/lib/utils'

export function SearchBar({
  value,
  onChange,
  onSubmit,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: (v: string) => void
}) {
  const { recent, removeRecent } = useSearch()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function submit(v: string) {
    onSubmit(v)
    setOpen(false)
  }

  const filtered = value
    ? YOUTUBE_TOPICS.filter((s) =>
        s.toLowerCase().includes(value.toLowerCase()),
      )
    : YOUTUBE_TOPICS

  return (
    <div ref={wrapRef} className="relative w-full max-w-xl">
      <div
        className={cn(
          'flex h-10 items-center gap-2 rounded-full border bg-card pl-4 pr-1.5 transition-colors',
          open ? 'border-primary/50' : 'border-border',
        )}
      >
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              submit(value)
            }
          }}
          placeholder="Search videos, channels…"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          aria-label="Search"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
        <button
          onClick={() => submit(value)}
          aria-label="Search"
          className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Search className="size-3.5" />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-2xl animate-in fade-in slide-in-from-top-1">
          {recent.length > 0 && (
            <div className="pb-1">
              <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Recent searches
              </p>
              {recent.slice(0, 5).map((r) => (
                <div
                  key={r}
                  className="group flex items-center gap-3 px-3 py-1.5 hover:bg-muted"
                >
                  <Clock className="size-4 shrink-0 text-muted-foreground" />
                  <button
                    onClick={() => submit(r)}
                    className="min-w-0 flex-1 truncate text-left text-sm text-foreground"
                  >
                    {r}
                  </button>
                  <button
                    onClick={() => removeRecent(r)}
                    aria-label={`Remove ${r}`}
                    className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {filtered.length > 0 && (
            <div className="border-t border-border pt-1">
              <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Topics
              </p>
              {filtered.slice(0, 5).map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-muted"
                >
                  <TrendingUp className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm text-foreground">{s}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
