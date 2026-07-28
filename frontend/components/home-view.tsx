'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HeroSection } from '@/components/hero-section'
import Link from 'next/link'
import { Clock3, Search, Sparkles } from 'lucide-react'
import { fetchYouTubeTopic, searchYouTube, type MediaVideo } from '@/lib/backend-api'

function watchHref(video: MediaVideo) {
  return video.id && !video.id.startsWith('http')
    ? `/youtube/watch/${encodeURIComponent(video.id)}`
    : `/downloader?url=${encodeURIComponent(video.sourceUrl)}`
}

function RecommendationCard({ video }: { video: MediaVideo }) {
  return (
    <Link href={watchHref(video)} className="group min-w-0">
      <div className="aspect-video overflow-hidden rounded-xl bg-muted">
        <img
          src={video.thumbnail || '/placeholder.svg'}
          alt={video.title}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </div>
      <h3 className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-primary">
        {video.title}
      </h3>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {video.channel} · {video.duration}
      </p>
    </Link>
  )
}

export function HomeView() {
  const router = useRouter()
  const [trending, setTrending] = useState<MediaVideo[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const cached = window.sessionStorage.getItem('reelhouse.home-feed')
      return cached ? (JSON.parse(cached) as MediaVideo[]) : []
    } catch {
      return []
    }
  })
  const [feedLoading, setFeedLoading] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      return !window.sessionStorage.getItem('reelhouse.home-feed')
    } catch {
      return true
    }
  })
  const [feedError, setFeedError] = useState(false)
  const [recentSearch] = useState(() => {
    if (typeof window === 'undefined') return ''
    try {
      const saved = window.localStorage.getItem('reelhouse.recent-searches')
      const searches = saved ? (JSON.parse(saved) as string[]) : []
      return searches[0]?.trim() || ''
    } catch {
      return ''
    }
  })
  const [recommended, setRecommended] = useState<MediaVideo[]>([])
  const [recommendationLoading, setRecommendationLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadFeedPreview() {
      setFeedLoading(true)
      setFeedError(false)
      try {
        const payload = await fetchYouTubeTopic('All')
        if (!cancelled) {
          const videos = payload.videos.slice(0, 5)
          setTrending(videos)
          try {
            window.sessionStorage.setItem('reelhouse.home-feed', JSON.stringify(videos))
          } catch {
            // Cache is an optimization only.
          }
        }
      } catch {
        if (!cancelled) {
          setTrending([])
          setFeedError(true)
        }
      } finally {
        if (!cancelled) setFeedLoading(false)
      }
    }

    void loadFeedPreview()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const query = recentSearch
    if (!query) return

    const cacheKey = `reelhouse.recommendations.${query.toLowerCase()}`

    async function loadRecommendations() {
      setRecommendationLoading(true)
      try {
        await Promise.resolve()
        const cached = window.sessionStorage.getItem(cacheKey)
        if (cached) {
          if (!cancelled) setRecommended(JSON.parse(cached) as MediaVideo[])
          return
        }

        const videos = await searchYouTube(query)
        if (cancelled) return
        const next = videos.slice(0, 6)
        setRecommended(next)
        try {
          window.sessionStorage.setItem(cacheKey, JSON.stringify(next))
        } catch {
          // Cache is an optimization only.
        }
      } catch {
        if (!cancelled) setRecommended([])
      } finally {
        if (!cancelled) setRecommendationLoading(false)
      }
    }

    void loadRecommendations()
    return () => {
      cancelled = true
    }
  }, [recentSearch])

  function openVideo(video: MediaVideo) {
    if (video.id && !video.id.startsWith('http')) {
      router.push(`/youtube/watch/${encodeURIComponent(video.id)}`)
      return
    }

    if (video.sourceUrl) {
      router.push(`/downloader?url=${encodeURIComponent(video.sourceUrl)}`)
      return
    }

    router.push('/youtube')
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-3 py-5 sm:px-5">
      <HeroSection
        trending={trending}
        feedLoading={feedLoading}
        feedError={feedError}
        onOpenWorkspace={() => router.push('/youtube')}
        onPasteLink={() => router.push('/downloader')}
        onOpenVideo={openVideo}
      />

      {(recentSearch || recommendationLoading) && (
        <section className="mt-6 rounded-2xl border border-border bg-card/60 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">Recommended for you</h2>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock3 className="size-3" /> Based on your recent search: <span className="truncate text-foreground">{recentSearch}</span>
              </p>
            </div>
            <Link href="/youtube" className="ml-auto hidden items-center gap-1.5 text-xs font-medium text-primary hover:underline sm:flex">
              <Search className="size-3.5" /> Explore more
            </Link>
          </div>
          {recommended.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {recommended.map((video) => <RecommendationCard key={video.id || video.sourceUrl} video={video} />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, index) => <div key={index} className="aspect-video animate-pulse rounded-xl bg-muted" />)}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
