'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, Clock, Loader2, Search, TrendingUp, X
} from 'lucide-react'
import { OnlineVideoCard, type OnlineVideoDownloadState } from '@/components/media/online-video-card'
import { useOnlineVideoDownload } from '@/hooks/use-online-video-download'
import { searchYouTube, type YoutubeSearchVideo } from '@/lib/backend-api'
import { addRecentSearch, normalizeRecentSearches, readRecentSearches, writeRecentSearches } from '@/lib/recent-searches'
import type { OnlineVideo } from '@/types/media'

export type OnlineResult = {
  id: string; videoId: string; title: string; channel: string; channelId: string
  thumbnail: string; duration: string | null; views: string | null
  published: string | null; publishedAt: string | null
  platform: 'youtube'; sourceUrl: string; description: string
}

type SearchResp = {
  results: OnlineResult[]; nextPageToken: string | null; totalResults: number
  query: string; error: string | null
}

function toOnlineResult(video: YoutubeSearchVideo): OnlineResult {
  return {
    id: video.id,
    videoId: video.id,
    title: video.title,
    channel: video.channel,
    channelId: '',
    thumbnail: video.thumbnail,
    duration: video.duration,
    views: null,
    published: null,
    publishedAt: null,
    platform: 'youtube',
    sourceUrl: video.sourceUrl || `https://www.youtube.com/watch?v=${video.id}`,
    description: '',
  }
}

function toOnlineVideo(result: OnlineResult): OnlineVideo {
  return { id: result.videoId, title: result.title, channel: result.channel, duration: result.duration || '', thumbnail: result.thumbnail, sourceUrl: result.sourceUrl }
}

const TRENDING_QUERIES = [
  'Python tutorial 2026', 'lo-fi music 2026', 'travel vlog', 'cooking recipe',
  'AI explained', 'workout at home', 'photography tips', 'web development',
]

/* ─── Shared primitives ─── */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-0 pb-28 sm:px-4 md:max-w-5xl md:pt-0">
      {children}
    </main>
  )
}

function VideoCard({ result, onDownload, downloadState }: { result: OnlineResult; onDownload?: (r: OnlineResult) => void; downloadState?: OnlineVideoDownloadState }) {
  const video = toOnlineVideo(result)
  return <OnlineVideoCard video={video} onDownload={() => onDownload?.(result)} downloadState={downloadState} />
}

function VideoRow({ result, onDownload, downloadState }: { result: OnlineResult; onDownload?: (r: OnlineResult) => void; downloadState?: OnlineVideoDownloadState }) {
  return <OnlineVideoCard video={toOnlineVideo(result)} compact onDownload={() => onDownload?.(result)} downloadState={downloadState} />
}

/* ─── Online search panel ─── */
function OnlineSearchPanel({
  query,
  onDownload,
  getDownloadState,
  onSearchSuccess,
}: {
  query: string
  onDownload: (r: OnlineResult) => void
  getDownloadState?: (video: OnlineVideo) => OnlineVideoDownloadState
  onSearchSuccess?: (query: string) => void
}) {
  const [data, setData] = useState<SearchResp | null>(null)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const fetchResults = useCallback(async (q: string) => {
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    try {
      const videos = await searchYouTube(q)
      if (!ctrl.signal.aborted) {
        const results = videos.map(toOnlineResult)
        setData({ results, nextPageToken: null, totalResults: results.length, query: q, error: null })
        onSearchSuccess?.(q)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setData({ results: [], nextPageToken: null, totalResults: 0, query: q, error: String(err) })
      }
    } finally {
      setLoading(false)
    }
  }, [onSearchSuccess])

  useEffect(() => {
    fetchResults(query)
  }, [query, fetchResults])

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-[#a3a3a3]">
        <Loader2 className="size-7 animate-spin text-primary" />
        <p className="text-sm">{query ? `Searching "${query}"…` : 'Loading trending…'}</p>
      </div>
    )
  }
  if (!data) return null
  if (data.error) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-sm font-semibold text-destructive">Search Error</p>
        <p className="max-w-sm text-xs text-[#a3a3a3]">{data.error}</p>
        <button onClick={() => fetchResults(query)} className="mt-2 rounded-xl bg-primary/10 px-4 py-2 text-sm text-primary">
          Retry
        </button>
      </div>
    )
  }

  if (!data.results.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <Search className="size-8 text-[#a3a3a3]" />
        <p className="font-semibold">No results for &quot;{query}&quot;</p>
        <p className="text-sm text-[#a3a3a3]">Try a different search term</p>
      </div>
    )
  }

  return (
    <div>
      {query && (
        <p className="mb-3 px-4 text-[13px] text-[#a3a3a3] sm:px-0">
          About {data.totalResults.toLocaleString()} results for <span className="font-semibold text-white">&quot;{query}&quot;</span>
        </p>
      )}
      {/* Mobile: vertical card feed (no left gutters) */}
      <div className="block sm:hidden">
        <div className="space-y-2">
          {data.results.map(r => <VideoCard key={r.id} result={r} onDownload={onDownload} downloadState={getDownloadState?.(toOnlineVideo(r))} />)}
        </div>
      </div>
      {/* Desktop: list rows */}
      <div className="hidden sm:block">
        <div className="space-y-1">
          {data.results.map(r => (
            <VideoRow key={r.id} result={r} onDownload={onDownload} downloadState={getDownloadState?.(toOnlineVideo(r))} />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Main Search Screen (08) ─── */
export function OnlineSearchScreen() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const download = useOnlineVideoDownload()

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      setRecentSearches(readRecentSearches())
    } catch { /* ignore */ }
  }, [])

  const saveRecent = useCallback((term: string) => setRecentSearches(addRecentSearch(term)), [])

  function removeRecent(term: string) {
    setRecentSearches(prev => {
      const next = normalizeRecentSearches(prev.filter(r => r !== term))
      writeRecentSearches(next)
      return next
    })
  }

  function submit(q: string) {
    const t = q.trim()
    if (!t) return
    setSubmitted(t)
    // Keep the discovery landing screen (08) distinct from the results screen (09).
    // Results are still fetched by the server-side provider route; this navigation
    // also makes the flow shareable and prevents online/library state from collapsing.
    router.push(`/search/results?q=${encodeURIComponent(t)}`)
  }

  function handleDownload(r: OnlineResult) { void download.begin(toOnlineVideo(r)) }

  const showingResults = submitted.length > 0

  return (
    <Shell>
      {/* Search header */}
      <div className="sticky top-0 z-30 bg-[#090909]">
        <div className="flex items-center gap-2 border-b border-[#292929] px-4 py-3 sm:px-4">
          <button
            onClick={() => router.back()}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-[#a3a3a3] hover:bg-[#1d1d1d] hover:text-white"
            aria-label="Back"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="flex h-10 flex-1 items-center gap-2 rounded-full border border-[#292929] bg-[#151515] px-3 focus-within:border-primary/60">
            <Search className="size-4 shrink-0 text-[#a3a3a3]" />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(query) }}
              placeholder="Search videos, music, creators…"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#a3a3a3]"
            />
            {query && (
              <button onClick={() => { setQuery(''); setSubmitted(''); inputRef.current?.focus() }} aria-label="Clear">
                <X className="size-4 text-[#a3a3a3] hover:text-white" />
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Content */}
      <div className="pt-4">
        {!showingResults ? (
          /* ─── Pre-search state ─── */
          <div className="space-y-6 px-4 sm:px-0">
            {recentSearches.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#a3a3a3]">Recent Searches</h2>
                <div className="space-y-1">
                  {recentSearches.map(r => (
                    <div key={r} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-[#151515]">
                      <Clock className="size-4 shrink-0 text-[#a3a3a3]" />
                      <button onClick={() => { setQuery(r); submit(r) }} className="min-w-0 flex-1 truncate text-left text-sm text-white">
                        {r}
                      </button>
                      <button onClick={() => removeRecent(r)} aria-label={`Delete recent search: ${r}`} className="flex size-9 shrink-0 items-center justify-center rounded-full text-[#a3a3a3] hover:bg-[#1d1d1d] hover:text-white">
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#a3a3a3]">Trending Searches</h2>
              <div className="space-y-1">
                {TRENDING_QUERIES.map(q => (
                  <button
                    key={q}
                    onClick={() => { setQuery(q); submit(q) }}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-[#151515]"
                  >
                    <TrendingUp className="size-4 shrink-0 text-primary" />
                    <span className="text-sm text-white">{q}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : (
          /* ─── Results ─── */
          <OnlineSearchPanel query={submitted} onDownload={handleDownload} getDownloadState={download.getDownloadState} onSearchSuccess={saveRecent} />
        )}
      </div>
      {download.dialogs}
    </Shell>
  )
}

/* ─── Search Results Screen (09) — standalone route ─── */
export function SearchResultsScreen() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const query = searchParams.get('q') || ''
  const download = useOnlineVideoDownload()

  function handleDownload(r: OnlineResult) { void download.begin(toOnlineVideo(r)) }

  return (
    <Shell>
      <div className="sticky top-0 z-30 bg-[#090909]">
        <div className="flex items-center gap-2 border-b border-[#292929] px-4 py-3">
          <button onClick={() => router.back()} className="flex size-9 shrink-0 items-center justify-center rounded-full text-[#a3a3a3] hover:bg-[#1d1d1d]" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
          <Link href={`/search`} className="flex h-10 flex-1 items-center gap-2 rounded-full border border-[#292929] bg-[#151515] px-3">
            <Search className="size-4 shrink-0 text-[#a3a3a3]" />
            <span className="flex-1 truncate text-sm text-white">{query}</span>
          </Link>
        </div>
      </div>
      <div className="pt-4">
        <OnlineSearchPanel query={query} onDownload={handleDownload} getDownloadState={download.getDownloadState} onSearchSuccess={addRecentSearch} />
      </div>
      {download.dialogs}
    </Shell>
  )
}
