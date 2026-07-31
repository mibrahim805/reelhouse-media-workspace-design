'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HeroSection } from '@/components/hero-section'
import { fetchYouTubeTopic, type MediaVideo } from '@/lib/backend-api'

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

    </div>
  )
}
