'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HeroSection } from '@/components/hero-section'
import { fetchYouTubeTopic, type MediaVideo, type QualityOption, videoIdFromUrl } from '@/lib/backend-api'
import { useDownloads } from '@/components/download-store'

export function HomeView() {
  const router = useRouter()
  const { startDownload } = useDownloads()
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

    const id = videoIdFromUrl(video.sourceUrl)
    if (id) {
      router.push(`/youtube/watch/${encodeURIComponent(id)}`)
      return
    }

    if (video.sourceUrl) {
      router.push(`/downloader?url=${encodeURIComponent(video.sourceUrl)}`)
      return
    }

    router.push('/youtube')
  }

  function searchVideos(query: string) {
    window.sessionStorage.setItem('reelhouse.active-search', query)
    router.push('/youtube')
  }

  function downloadVideo(video: MediaVideo, quality: QualityOption) {
    startDownload({ title: video.title, channel: video.channel, thumbnail: video.thumbnail, quality: quality.label, qualityValue: quality.value, size: quality.size, source: video.platform, sourceUrl: video.sourceUrl })
  }

  return (
    <div className="min-h-[calc(100svh-3.5rem)] bg-[#f5f5f5] px-4 py-5 text-slate-900 sm:px-5">
      <HeroSection
        trending={trending}
        feedLoading={feedLoading}
        feedError={feedError}
        onPasteLink={() => router.push('/downloader')}
        onSubmitUrl={(url) => router.push(`/downloader?url=${encodeURIComponent(url)}`)}
        onSearch={searchVideos}
        onDownloadVideo={downloadVideo}
        onOpenVideo={openVideo}
      />

    </div>
  )
}
