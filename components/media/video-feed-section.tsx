'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { OnlineVideo } from '@/types/media'
import { OnlineVideoCard, type OnlineVideoDownloadState } from '@/components/media/online-video-card'

function SkeletonCard() {
  return <div className="animate-pulse"><div className="aspect-video rounded-2xl bg-[#151515]" /><div className="mt-3 h-4 w-11/12 rounded bg-[#151515]" /><div className="mt-2 h-3 w-2/5 rounded bg-[#151515]" /></div>
}

export function VideoFeedSection({ title, videos, loading = false, error = '', onRetry, onDownload, getDownloadState, actionHref }: { title: string; videos: OnlineVideo[]; loading?: boolean; error?: string; onRetry?: () => void; onDownload: (video: OnlineVideo) => void; getDownloadState: (video: OnlineVideo) => OnlineVideoDownloadState; actionHref?: string }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[18px] font-semibold tracking-[-.02em] text-white">{title}</h2>
        {actionHref && <Link href={actionHref} className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-primary">See all <ChevronRight className="size-3.5" /></Link>}
      </div>
      {loading ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div> : error ? <div className="rounded-2xl border border-dashed border-[#292929] px-4 py-5 text-center"><p className="text-sm text-[#a3a3a3]">Unable to load videos.</p>{onRetry && <button type="button" onClick={onRetry} className="mt-3 rounded-xl bg-primary/10 px-4 py-2 text-xs font-semibold text-primary">Retry</button>}</div> : videos.length ? <div className="grid gap-x-5 gap-y-7 md:grid-cols-2 xl:grid-cols-3">{videos.map(video => <OnlineVideoCard key={video.id} video={video} onDownload={onDownload} downloadState={getDownloadState(video)} />)}</div> : <p className="rounded-2xl border border-dashed border-[#292929] px-4 py-5 text-center text-xs text-[#737373]">No videos found.</p>}
    </section>
  )
}
