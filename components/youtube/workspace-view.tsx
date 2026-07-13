'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Clock, History, Loader2, Search, SearchX } from 'lucide-react'
import { SearchBar } from '@/components/youtube/search-bar'
import { useSearch } from '@/components/youtube/search-store'
import { CATEGORIES, VIDEOS, type Video } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

function FeedCard({ video }: { video: Video }) {
  return (
    <Link href={`/youtube/watch/${video.id}`} className="group flex flex-col">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
        <img
          src={video.thumbnail || '/placeholder.svg'}
          alt={video.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <span className="absolute bottom-2 right-2 rounded bg-background/85 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-foreground">
          {video.duration}
        </span>
      </div>
      <div className="mt-2.5 flex gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-foreground">
          {video.channelInitials}
        </span>
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground group-hover:text-primary">
            {video.title}
          </h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {video.channel}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {video.views} · {video.published}
          </p>
        </div>
      </div>
    </Link>
  )
}

function ResultRow({ video }: { video: Video }) {
  return (
    <Link
      href={`/youtube/watch/${video.id}`}
      className="group flex flex-col gap-3 rounded-xl p-2 transition-colors hover:bg-card sm:flex-row"
    >
      <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-muted sm:w-72 lg:w-80">
        <img
          src={video.thumbnail || '/placeholder.svg'}
          alt={video.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <span className="absolute bottom-2 right-2 rounded bg-background/85 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-foreground">
          {video.duration}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-base font-medium leading-snug text-foreground group-hover:text-primary">
          {video.title}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {video.views} · {video.published}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-foreground">
            {video.channelInitials}
          </span>
          <span className="text-xs text-muted-foreground">{video.channel}</span>
        </div>
        <p className="mt-2 line-clamp-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          {video.description}
        </p>
        <span className="mt-2 inline-block rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
          {video.category}
        </span>
      </div>
    </Link>
  )
}

export function WorkspaceView() {
  const { recent, addRecent } = useSearch()
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [filter, setFilter] = useState('All')
  const [loading, setLoading] = useState(false)

  function runSearch(term: string) {
    const t = term.trim()
    setLoading(true)
    setSubmitted(t)
    setFilter('All')
    if (t) addRecent(t)
    // Simulate a brief fetch so loading state is visible.
    setTimeout(() => setLoading(false), 550)
  }

  const isSearching = submitted.length > 0

  const results = useMemo(() => {
    let list = VIDEOS
    if (submitted) {
      const q = submitted.toLowerCase()
      const matched = VIDEOS.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          v.channel.toLowerCase().includes(q) ||
          v.category.toLowerCase().includes(q) ||
          v.description.toLowerCase().includes(q),
      )
      // Fall back to full catalog so results always feel populated.
      list = matched.length > 0 ? matched : VIDEOS
    }
    if (filter !== 'All') list = list.filter((v) => v.category === filter)
    return list
  }, [submitted, filter])

  return (
    <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-5">
      {/* Sticky sub-header: search + chips stay visible */}
      <div className="sticky top-14 z-30 -mx-3 mb-3 border-b border-border bg-background/90 px-3 pb-2.5 pt-1 backdrop-blur-md sm:-mx-5 sm:px-5">
        <div className="flex items-center gap-3 py-1.5">
          <SearchBar value={query} onChange={setQuery} onSubmit={runSearch} />
          {isSearching && (
            <button
              onClick={() => {
                setSubmitted('')
                setQuery('')
                setFilter('All')
              }}
              className="hidden shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground sm:block"
            >
              Clear results
            </button>
          )}
        </div>
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-0.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={cn(
                'shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                filter === c
                  ? 'bg-foreground text-background'
                  : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm">Searching for “{submitted}”…</p>
        </div>
      ) : isSearching ? (
        <SearchResults query={submitted} results={results} />
      ) : (
        <FeedState recent={recent} onPick={runSearch} results={results} />
      )}
    </div>
  )
}

function FeedState({
  recent,
  onPick,
  results,
}: {
  recent: string[]
  onPick: (t: string) => void
  results: Video[]
}) {
  return (
    <div>
      {recent.length > 0 && (
        <section className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">
              Based on your recent searches
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <button
                key={r}
                onClick={() => onPick(r)}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[13px] text-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                <Clock className="size-3.5 text-muted-foreground" />
                {r}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">Recommended</h2>
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {results.map((v) => (
          <FeedCard key={v.id} video={v} />
        ))}
      </div>
    </div>
  )
}

function SearchResults({
  query,
  results,
}: {
  query: string
  results: Video[]
}) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <SearchX className="size-6 text-muted-foreground" />
        </div>
        <p className="text-base font-medium text-foreground">No results found</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          We couldn&apos;t find anything for that filter. Try a different
          category or search term.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Search className="size-4" />
        <span>
          Results for{' '}
          <span className="font-medium text-foreground">“{query}”</span> ·{' '}
          {results.length} videos
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {results.map((v) => (
          <ResultRow key={v.id} video={v} />
        ))}
      </div>
    </div>
  )
}
