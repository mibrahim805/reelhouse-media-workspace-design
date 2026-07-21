'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HeroSection } from '@/components/hero-section'
import { fetchYouTubeTopic, type MediaVideo } from '@/lib/backend-api'

export function HomeView() {
  const router = useRouter()
  const [trending, setTrending] = useState<MediaVideo[]>([])
  const [feedLoading, setFeedLoading] = useState(true)
  const [feedError, setFeedError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadFeedPreview() {
      setFeedLoading(true)
      setFeedError(false)
      try {
        const payload = await fetchYouTubeTopic('All')
        if (!cancelled) setTrending(payload.videos.slice(0, 5))
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
