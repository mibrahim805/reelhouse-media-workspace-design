'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, Download, ExternalLink, Loader2, Play,
  Search, Flame, WifiOff
} from 'lucide-react'
import { useDownloads } from '@/components/download-store'
import { useMedia } from '@/components/media-state'
import { useOnlineVideoDownload } from '@/hooks/use-online-video-download'
import { cn } from '@/lib/utils'
import type { OnlineResult } from '@/components/search-screens'

type SearchResp = { results: OnlineResult[]; configured: boolean; error: string | null }

/* ─── Primitives ─── */
function Shell({ children }: { children: React.ReactNode }) {
  return <main className="w-full pb-28">{children}</main>
}

function OnlineVideoCard({ result, onDownload }: { result: OnlineResult; onDownload: () => void }) {
  function handleDownload(e: React.MouseEvent) {
    e.preventDefault()
    onDownload()
  }
  return (
    <Link href={`/watch/${result.videoId}`} className="group min-w-0 shrink-0 snap-start">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-[#151515]">
        <img src={result.thumbnail || '/placeholder.svg'} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
        {result.duration && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
            {result.duration}
          </span>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex size-10 items-center justify-center rounded-full bg-white/90 text-black shadow-xl">
            <Play className="ml-0.5 size-4 fill-current" />
          </span>
        </div>
        <button
          onClick={handleDownload}
          className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-primary"
          aria-label="Download"
        >
          <Download className="size-3.5" />
        </button>
      </div>
      <div className="mt-2 px-0.5">
        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-white">{result.title}</p>
        <p className="mt-0.5 truncate text-[12px] text-[#a3a3a3]">{result.channel}</p>
        {result.views && <p className="truncate text-[12px] text-[#a3a3a3]">{result.views}</p>}
      </div>
    </Link>
  )
}

function LocalVideoCard({ item }: { item: ReturnType<typeof useDownloads>['downloads'][0] }) {
  const { open } = useMedia()
  return (
    <button onClick={() => open(item)} className="group min-w-0 shrink-0 snap-start text-left">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-[#151515]">
        <img src={item.thumbnail || '/placeholder.svg'} alt="" className="size-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
          <Play className="size-8 fill-white text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100" />
        </div>
      </div>
      <p className="mt-2 line-clamp-2 px-0.5 text-[13px] font-medium leading-snug text-white">{item.title}</p>
      <p className="mt-0.5 truncate px-0.5 text-[12px] text-[#a3a3a3]">{item.source} · {item.size}</p>
    </button>
  )
}

function OnlineRail({ title, results, onDownload }: { title: string; results: OnlineResult[]; onDownload: (result: OnlineResult) => void }) {
  if (!results.length) return null
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center px-4">
        <h2 className="text-[17px] font-bold text-white">{title}</h2>
        <Link href="/search?type=trending" className="ml-auto flex items-center gap-1 text-[13px] text-[#a3a3a3] hover:text-primary">
          See all <ChevronRight className="size-4" />
        </Link>
      </div>
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4">
        {results.slice(0, 10).map(r => (
          <div key={r.id} className="w-[75vw] max-w-[300px] sm:w-[260px]">
            <OnlineVideoCard result={r} onDownload={() => onDownload(r)} />
          </div>
        ))}
      </div>
    </section>
  )
}

function LocalRail({ title, items }: { title: string; items: ReturnType<typeof useDownloads>['downloads'] }) {
  if (!items.length) return null
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center px-4">
        <h2 className="text-[17px] font-bold text-white">{title}</h2>
        <Link href="/library" className="ml-auto flex items-center gap-1 text-[13px] text-[#a3a3a3] hover:text-primary">
          See all <ChevronRight className="size-4" />
        </Link>
      </div>
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4">
        {items.slice(0, 8).map(item => (
          <div key={item.id} className="w-[55vw] max-w-[220px] sm:w-[200px]">
            <LocalVideoCard item={item} />
          </div>
        ))}
      </div>
    </section>
  )
}

/* ─── Hero featured card ─── */
function FeaturedHero({ result }: { result: OnlineResult }) {
  return (
    <div className="relative mx-4 mt-4 overflow-hidden rounded-3xl bg-[#151515]">
      <div className="aspect-[16/8] w-full">
        <img src={result.thumbnail || '/placeholder.svg'} alt="" className="size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-2.5 py-1 text-[11px] font-semibold text-primary">
          <Flame className="size-3" /> Trending
        </span>
        <h2 className="mt-2 line-clamp-2 text-base font-bold leading-snug text-white">{result.title}</h2>
        <p className="mt-1 text-[13px] text-[#a3a3a3]">{result.channel}</p>
        <div className="mt-3 flex gap-2">
          <a
            href={`/watch/${result.videoId}`}
            className="flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-black"
          >
            <Play className="size-4 fill-current" /> Watch
          </a>
          <Link
            href={`/watch/${result.videoId}`}
            className="flex h-9 items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 text-[13px] font-medium text-white"
          >
            <ExternalLink className="size-3.5" /> Open
          </Link>
        </div>
      </div>
    </div>
  )
}

/* ─── Category pills ─── */
const CATEGORIES = ['Trending', 'Videos', 'Music', 'Gaming', 'Travel', 'Tech', 'Fitness', 'Cooking']

/* ─── Main Explore Screen (07) ─── */
export function ExploreScreen() {
  const { downloads } = useDownloads()
  const download = useOnlineVideoDownload()
  const completed = downloads.filter(d => d.status === 'completed')
  const isAudio = (d: typeof completed[0]) => /\.(mp3|m4a|aac|wav|ogg)$/i.test(d.filename || '') || d.qualityValue === 'audio'
  const videos = completed.filter(d => !isAudio(d))
  const music = completed.filter(isAudio)

  const [category, setCategory] = useState('Trending')
  const [trending, setTrending] = useState<OnlineResult[]>([])
  const [gaming, setGaming] = useState<OnlineResult[]>([])
  const [music_online, setMusicOnline] = useState<OnlineResult[]>([])
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState<boolean | null>(null)

  const fetchSection = useCallback(async (query: string | null, setter: (v: OnlineResult[]) => void) => {
    try {
      const url = query ? `/api/search?q=${encodeURIComponent(query)}&maxResults=12` : `/api/search?type=trending&maxResults=12`
      const res = await fetch(url)
      const json = await res.json()
      setter(json.results || [])
      return json.configured as boolean
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchSection(null, v => { setTrending(v) }),
      fetchSection('gaming highlights 2026', setGaming),
      fetchSection('music 2026', setMusicOnline),
    ]).then(results => {
      setConfigured(results[0] !== false)
      setLoading(false)
    })
  }, [fetchSection])

  const categoryResults: OnlineResult[] = (
    category === 'Trending' ? trending :
    category === 'Gaming' ? gaming :
    category === 'Music' ? music_online :
    trending
  )

  function handleDownload(result: OnlineResult) {
    void download.begin({
      id: result.videoId,
      title: result.title,
      channel: result.channel,
      duration: result.duration || '',
      thumbnail: result.thumbnail,
      sourceUrl: result.sourceUrl,
    })
  }

  return (
    <Shell>
      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-[#292929] bg-[#090909]">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-[20px] font-bold text-white">Explore</h1>
          <Link href="/search" className="flex size-9 items-center justify-center rounded-full border border-[#292929] bg-[#151515] text-[#a3a3a3] hover:text-white" aria-label="Search">
            <Search className="size-4" />
          </Link>
        </div>
        {/* Category pills */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                'shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors',
                category === c ? 'bg-white text-black' : 'bg-[#1d1d1d] text-[#a3a3a3] hover:text-white',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-24 text-[#a3a3a3]">
          <Loader2 className="size-7 animate-spin text-primary" />
          <p className="text-sm">Loading discovery feed…</p>
        </div>
      ) : configured === false ? (
        /* Not configured state */
        <div className="space-y-6 px-4 pt-8">
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-[#292929] py-16 text-center">
            <WifiOff className="size-8 text-[#a3a3a3]" />
            <h2 className="mt-4 text-lg font-bold text-white">Online discovery not configured</h2>
            <p className="mt-2 max-w-xs text-sm text-[#a3a3a3]">
              Set <code className="rounded bg-[#1d1d1d] px-1 py-0.5 text-xs">YOUTUBE_API_KEY</code> to enable online video discovery.
            </p>
            <Link href="/search" className="mt-5 flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white">
              <Search className="size-4" /> Search Anyway
            </Link>
          </div>
          {/* Still show local library if we have content */}
          {completed.length > 0 && (
            <>
              <LocalRail title="From Your Library" items={completed} />
              {videos.length > 0 && <LocalRail title="Downloaded Videos" items={videos} />}
            </>
          )}
        </div>
      ) : (
        <>
          {/* Featured hero */}
          {trending[0] && <FeaturedHero result={trending[0]} />}

          {/* Online rails */}
          <OnlineRail title="Trending Today" results={trending.slice(1)} onDownload={handleDownload} />
          <OnlineRail title="Gaming Highlights" results={gaming} onDownload={handleDownload} />
          <OnlineRail title="Music & Audio" results={music_online} onDownload={handleDownload} />

          {/* Category grid when a specific cat is selected */}
          {category !== 'Trending' && categoryResults.length > 0 && (
            <section className="mt-8 px-4">
              <h2 className="mb-4 text-[17px] font-bold text-white">{category}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {categoryResults.slice(0, 8).map(r => (
                  <OnlineVideoCard key={r.id} result={r} onDownload={() => handleDownload(r)} />
                ))}
              </div>
            </section>
          )}

          {/* Local library section */}
          {completed.length > 0 && (
            <LocalRail title="From Your Library" items={completed} />
          )}
        </>
      )}

      <div className="h-4" />
      {download.dialogs}
    </Shell>
  )
}
