'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Download, Play, Search } from 'lucide-react'
import { useOnlineVideoDownload } from '@/hooks/use-online-video-download'
import { fetchYouTubeTopic, searchYouTube } from '@/lib/backend-api'
import { useNetworkStatus } from '@/lib/network-status'
import { readRecentSearches } from '@/lib/recent-searches'
import type { OnlineVideo } from '@/types/media'

const FALLBACK_VIDEOS: OnlineVideo[] = [
  { id: 'Kbj2Zss-5GY', title: 'A$AP Rocky - Praise The Lord (Da Shine) ft. Skepta', channel: 'A$AP Rocky', duration: '3:25', thumbnail: '/images/home/asap_rocky.png', sourceUrl: 'https://www.youtube.com/watch?v=Kbj2Zss-5GY' },
  { id: 'H58vbez_m4E', title: 'Kendrick Lamar - Not Like Us', channel: 'Kendrick Lamar', duration: '4:34', thumbnail: '/images/home/kendrick_lamar.png', sourceUrl: 'https://www.youtube.com/watch?v=H58vbez_m4E' },
  { id: 'eVTXPUF4Oz4', title: 'Linkin Park - In The End (Official HD Video)', channel: 'Linkin Park', duration: '3:36', thumbnail: '/images/home/linkin_park.png', sourceUrl: 'https://www.youtube.com/watch?v=eVTXPUF4Oz4' },
  { id: 'e-ORhEE9VVg', title: 'Taylor Swift - Blank Space', channel: 'Taylor Swift', duration: '4:33', thumbnail: '/images/home/taylor_swift.png', sourceUrl: 'https://www.youtube.com/watch?v=e-ORhEE9VVg' },
]

function mergeResults(groups: Array<{ query: string; videos: OnlineVideo[] }>) {
  const seen = new Set<string>()
  const merged: OnlineVideo[] = []
  for (let index = 0; index < 8; index += 1) {
    for (const group of groups) {
      const video = group.videos[index]
      if (video && video.id && !seen.has(video.id)) {
        seen.add(video.id)
        merged.push(video)
      }
    }
  }
  return merged
}

function ReelhouseMark() {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff5c63] to-[#d8325d] text-white shadow-[0_8px_20px_rgba(255,83,99,0.2)]">
      <Play className="ml-0.5 size-5 fill-current" />
    </span>
  )
}

function VideoFeedCard({ video, onDownload }: { video: OnlineVideo; onDownload: () => void }) {
  return (
    <article className="home-feed-card home-liquid-card group overflow-hidden rounded-3xl p-2">
      <Link href={`/watch/${encodeURIComponent(video.id)}`} className="block">
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#24272d]">
          <img
            src={video.thumbnail || '/placeholder.svg'}
            alt=""
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
            decoding="async"
            onError={event => { event.currentTarget.src = '/placeholder.svg' }}
          />
          <span className="absolute bottom-2 right-2 rounded-md bg-black/85 px-2 py-1 text-[11px] font-semibold text-white">
            {video.duration || 'Video'}
          </span>
        </div>
      </Link>

      <div className="flex items-start gap-3 px-1 pb-1 pt-3">
        <span className="home-liquid-avatar flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white/80">
          {(video.channel || 'R').slice(0, 1).toUpperCase()}
        </span>
        <Link href={`/watch/${encodeURIComponent(video.id)}`} className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-[15px] font-semibold leading-5 text-white">{video.title}</h2>
          <p className="mt-1 truncate text-xs text-[#a7abb4]">{video.channel || 'YouTube'}</p>
        </Link>
        <button
          type="button"
          onClick={onDownload}
          aria-label={`Download ${video.title}`}
          className="home-liquid-action flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-white transition-colors hover:bg-white/20 active:scale-95"
        >
          <Download className="size-4" />
          <span className="hidden min-[420px]:inline">Download</span>
        </button>
      </div>
    </article>
  )
}

export function HomeScreen() {
  const online = useNetworkStatus()
  // Keep the first paint useful while personalized results are loading. The
  // backend results replace this feed as soon as they arrive.
  const [recommendations, setRecommendations] = useState<OnlineVideo[]>(FALLBACK_VIDEOS)
  const download = useOnlineVideoDownload()

  useEffect(() => {
    let cancelled = false

    if (!online) {
      setRecommendations(FALLBACK_VIDEOS)
      return
    }

    const stored = readRecentSearches()
    const loadFeed = async () => {
      try {
        if (stored.length > 0) {
          const queries = stored.slice(0, 2)
          const groups = await Promise.all(
            queries.map(async query => ({ query, videos: await searchYouTube(query, 8) })),
          )
          const nextFeed = mergeResults(groups).slice(0, 16)
          if (!cancelled) setRecommendations(nextFeed.length > 0 ? nextFeed : FALLBACK_VIDEOS)
        } else {
          const topic = await fetchYouTubeTopic('All')
          if (!cancelled) setRecommendations(topic.videos.length > 0 ? topic.videos : FALLBACK_VIDEOS)
        }
      } catch {
        if (!cancelled) setRecommendations(FALLBACK_VIDEOS)
      }
    }

    void loadFeed()
    return () => { cancelled = true }
  }, [online])

  const feed = recommendations

  return (
    <main className="home-screen home-liquid-screen relative min-h-screen overflow-hidden px-4 pb-28 pt-5 text-white sm:px-6 md:pb-10">
      <div className="home-liquid-backdrop pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <span className="home-liquid-orb home-liquid-orb-coral" />
        <span className="home-liquid-orb home-liquid-orb-violet" />
        <span className="home-liquid-orb home-liquid-orb-cyan" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-3xl">
        <header className="home-liquid-header home-entrance-header flex items-center justify-between rounded-3xl px-3 py-2">
          <Link href="/" className="flex items-center" aria-label="Reelhouse home">
            <ReelhouseMark />
          </Link>
          <div className="flex items-center gap-1">
            <Link href="/search" aria-label="Search" className="flex size-10 items-center justify-center rounded-full text-[#d8dbe2] transition-colors hover:bg-white/10 active:scale-90">
              <Search className="size-5" />
            </Link>
            <Link href="/downloads" aria-label="Downloads" className="flex size-10 items-center justify-center rounded-full text-[#d8dbe2] transition-colors hover:bg-white/10 active:scale-90">
              <Download className="size-5" />
            </Link>
          </div>
        </header>

        {!online && <div className="home-liquid-status mt-3 rounded-2xl px-4 py-3 text-xs text-[#d0d3dc]">You&apos;re offline. Your downloaded media is still available on this device.</div>}

        <section className="home-feed mt-5" aria-label="Personalized video feed">
          <div className="space-y-4">
            {feed.map(video => <VideoFeedCard key={video.id} video={video} onDownload={() => download.begin(video)} />)}
          </div>
        </section>
      </div>
      {download.dialogs}
    </main>
  )
}
