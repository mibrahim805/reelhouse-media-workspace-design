'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Clock, History, Loader2, Search, SearchX } from 'lucide-react'
import { SearchBar } from '@/components/youtube/search-bar'
import { useSearch } from '@/components/youtube/search-store'
import {
  fetchYouTubeTopic,
  searchYouTube,
  saveAccountSearch,
  YOUTUBE_TOPICS,
  type MediaVideo,
} from '@/lib/backend-api'
import { cn } from '@/lib/utils'

function watchHref(video: MediaVideo) {
  if (video.id && !video.id.startsWith('http')) {
    return `/youtube/watch/${encodeURIComponent(video.id)}`
  }

  return `/downloader?url=${encodeURIComponent(video.sourceUrl)}`
}

const SEARCH_CACHE_TTL = 10 * 60 * 1000

function readCachedResults(key: string) {
  try {
    const raw = window.sessionStorage.getItem(`reelhouse.results.${key}`)
    if (!raw) return null
    const cached = JSON.parse(raw) as { savedAt: number; videos: MediaVideo[] }
    return Date.now() - cached.savedAt < SEARCH_CACHE_TTL ? cached.videos : null
  } catch {
    return null
  }
}

function writeCachedResults(key: string, videos: MediaVideo[]) {
  try {
    window.sessionStorage.setItem(
      `reelhouse.results.${key}`,
      JSON.stringify({ savedAt: Date.now(), videos }),
    )
  } catch {
    // Cache is an optimization only.
  }
}

function FeedCard({ video }: { video: MediaVideo }) {
  return (
    <Link href={watchHref(video)} className="group flex flex-col">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
        <img
          src={video.thumbnail || '/placeholder.svg'}
          alt={video.title}
          loading="lazy"
          decoding="async"
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
            {video.duration} · {video.platform}
          </p>
        </div>
      </div>
    </Link>
  )
}

function ResultRow({ video }: { video: MediaVideo }) {
  return (
    <Link
      href={watchHref(video)}
      className="group flex flex-col gap-3 rounded-xl p-2 transition-colors hover:bg-card sm:flex-row"
    >
      <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-muted sm:w-72 lg:w-80">
        <img
          src={video.thumbnail || '/placeholder.svg'}
          alt={video.title}
          loading="lazy"
          decoding="async"
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
          {video.duration} · {video.platform}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-foreground">
            {video.channelInitials}
          </span>
          <span className="text-xs text-muted-foreground">{video.channel}</span>
        </div>
        <p className="mt-2 line-clamp-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          {video.sourceUrl}
        </p>
        {video.category && (
          <span className="mt-2 inline-block rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            {video.category}
          </span>
        )}
      </div>
    </Link>
  )
}

export function WorkspaceView() {
  const { recent, addRecent } = useSearch()
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [topic, setTopic] = useState('All')
  const [results, setResults] = useState<MediaVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadTopic(nextTopic: string) {
    const cacheKey = `topic.${nextTopic.toLowerCase()}`
    const cached = readCachedResults(cacheKey)
    if (cached) setResults(cached)
    setLoading(!cached)
    setError('')
    setSubmitted('')
    setTopic(nextTopic)

    try {
      const payload = await fetchYouTubeTopic(nextTopic)
      setResults(payload.videos)
      writeCachedResults(cacheKey, payload.videos)
    } catch (err) {
      setResults([])
      setError(err instanceof Error ? err.message : 'Could not load videos.')
    } finally {
      setLoading(false)
    }
  }

  async function runSearch(term: string) {
    const t = term.trim()
    if (!t) {
      await loadTopic('All')
      return
    }

    const cacheKey = `search.${t.toLowerCase()}`
    const cached = readCachedResults(cacheKey)
    if (cached) setResults(cached)
    setLoading(!cached)
    setError('')
    setSubmitted(t)
    setTopic('All')
    if (t) {
      addRecent(t)
      void saveAccountSearch(t).catch(() => undefined)
    }

    try {
      const videos = await searchYouTube(t)
      setResults(videos)
      writeCachedResults(cacheKey, videos)
    } catch (err) {
      setResults([])
      setError(err instanceof Error ? err.message : 'Search failed.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitialTopic() {
      const cacheKey = 'topic.all'
      const cached = readCachedResults(cacheKey)
      if (cached) {
        setResults(cached)
        setLoading(false)
      }
      try {
        const payload = await fetchYouTubeTopic('All')
        if (!cancelled) {
          setResults(payload.videos)
          writeCachedResults(cacheKey, payload.videos)
        }
      } catch (err) {
        if (!cancelled) {
          setResults([])
          setError(err instanceof Error ? err.message : 'Could not load videos.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadInitialTopic()
    return () => {
      cancelled = true
    }
  }, [])

  const isSearching = submitted.length > 0

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
                void loadTopic('All')
              }}
              className="hidden shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground sm:block"
            >
              Clear results
            </button>
          )}
        </div>
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-0.5">
          {YOUTUBE_TOPICS.map((c) => (
            <button
              key={c}
              onClick={() => {
                setQuery('')
                void loadTopic(c)
              }}
              className={cn(
                'shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                !isSearching && topic === c
                  ? 'bg-foreground text-background'
                  : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm">
            {submitted ? `Searching for "${submitted}"...` : `Loading ${topic}...`}
          </p>
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
  results: MediaVideo[]
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
      {results.length > 0 ? (
        <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((v) => (
            <FeedCard key={v.id || v.sourceUrl} video={v} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No videos loaded yet.
        </div>
      )}
    </div>
  )
}

function SearchResults({
  query,
  results,
}: {
  query: string
  results: MediaVideo[]
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
          <ResultRow key={v.id || v.sourceUrl} video={v} />
        ))}
      </div>
    </div>
  )
}
