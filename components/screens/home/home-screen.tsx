'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Play, Search } from 'lucide-react'
import { VideoFeedSection } from '@/components/media/video-feed-section'
import { useOnlineVideoDownload } from '@/hooks/use-online-video-download'
import { fetchYouTubeTopic, searchYouTube } from '@/lib/backend-api'
import { readRecentSearches } from '@/lib/recent-searches'
import type { OnlineVideo } from '@/types/media'

export function HomeScreen() {
  const [trending, setTrending] = useState<OnlineVideo[]>([])
  const [trendingLoading, setTrendingLoading] = useState(true)
  const [trendingError, setTrendingError] = useState('')
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [recommendations, setRecommendations] = useState<Array<{ query: string; videos: OnlineVideo[] }>>([])
  const [reload, setReload] = useState(0)
  const download = useOnlineVideoDownload()

  useEffect(() => {
    let cancelled = false
    const stored = readRecentSearches()
    const recent = stored.slice(0, 2)
    setRecentSearches(stored)
    setTrendingLoading(true)
    setTrendingError('')

    fetchYouTubeTopic('All').then(data => {
      if (!cancelled) setTrending(data.videos)
    }).catch(error => {
      if (!cancelled) setTrendingError(error instanceof Error ? error.message : 'Unable to load videos.')
    }).finally(() => {
      if (!cancelled) setTrendingLoading(false)
    })

    Promise.all(recent.map(query => searchYouTube(query).then(videos => ({ query, videos })).catch(() => ({ query, videos: [] as OnlineVideo[] }))))
      .then(results => { if (!cancelled) setRecommendations(results.filter(result => result.videos.length > 0)) })
    return () => { cancelled = true }
  }, [reload])

  function retry() { setReload(value => value + 1) }
  return (
    <main className="mx-auto w-full max-w-[1240px] overflow-hidden px-4 pb-32 sm:px-6 md:pb-12">
      <header className="flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2" aria-label="Reelhouse home">
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-primary shadow-[0_0_22px_rgba(139,92,246,.25)]"><Play className="size-4 fill-white text-white" /></span>
          <span className="text-[18px] font-bold tracking-[-.03em] text-white">Reelhouse</span>
        </Link>
        <Link href="/search" className="flex size-11 items-center justify-center rounded-full text-[#a3a3a3] hover:bg-[#151515] hover:text-white" aria-label="Search online videos"><Search className="size-[19px]" /></Link>
      </header>

      <VideoFeedSection title="Trending" videos={trending.slice(0, 2)} loading={trendingLoading} error={trendingError} onRetry={retry} onDownload={download.begin} getDownloadState={download.getDownloadState} />
      {!trendingLoading && !trendingError && recentSearches.length === 0 && <p className="mt-6 text-center text-xs text-[#737373]">Search for videos to personalize your feed.</p>}
      {recommendations.map(({ query, videos }) => <VideoFeedSection key={query} title={`Because you searched “${query}”`} videos={videos.slice(0, 4)} onDownload={download.begin} getDownloadState={download.getDownloadState} />)}
      {download.dialogs}
    </main>
  )
}
