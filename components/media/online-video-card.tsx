'use client'

import Link from 'next/link'
import { Check, Download, Loader2, RotateCcw } from 'lucide-react'
import type { OnlineVideo } from '@/types/media'

export type OnlineVideoDownloadState = {
  phase: 'idle' | 'analyzing' | 'ready' | 'downloading' | 'completed' | 'failed'
  error?: string
}

export function OnlineVideoCard({ video, onDownload, downloadState, compact = false, showChannel = true }: { video: OnlineVideo; onDownload: (video: OnlineVideo) => void; downloadState?: OnlineVideoDownloadState; compact?: boolean; showChannel?: boolean }) {
  const state = downloadState || { phase: 'idle' as const }
  const isBusy = state.phase === 'analyzing' || state.phase === 'ready' || state.phase === 'downloading'

  return (
    <article className={`group min-w-0 ${compact ? 'flex gap-3 rounded-2xl p-2 hover:bg-[#151515]' : ''}`}>
      <Link href={`/watch/${encodeURIComponent(video.id)}`} className={`block min-w-0 ${compact ? 'w-40 shrink-0 sm:w-48' : 'w-full'}`}>
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#151515]">
          <img src={video.thumbnail || '/placeholder.svg'} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
          {video.duration && <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">{video.duration}</span>}
        </div>
      </Link>
      <div className={`min-w-0 ${compact ? 'flex-1 py-0.5' : 'flex items-start gap-3 pt-3'}`}>
        <div className="min-w-0 flex-1">
          <Link href={`/watch/${encodeURIComponent(video.id)}`}>
            <h3 className={`${compact ? 'line-clamp-2 text-[13px]' : 'line-clamp-2 text-[15px]'} font-semibold leading-snug text-white group-hover:text-primary`}>{video.title}</h3>
          </Link>
          {showChannel && <p className="mt-1 truncate text-[12px] text-[#a3a3a3]">{video.channel}</p>}
          {state.error && <p className="mt-1 line-clamp-2 text-[11px] text-red-300">{state.error}</p>}
        </div>
        <button type="button" disabled={isBusy} onClick={() => onDownload(video)} className={`${compact ? 'mt-1' : 'mt-0.5'} flex size-10 shrink-0 items-center justify-center rounded-full border border-[#292929] text-[#a3a3a3] transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary disabled:cursor-wait disabled:opacity-80`} aria-label={`${state.phase === 'completed' ? 'Downloaded' : 'Download'} ${video.title}`}>
          {state.phase === 'analyzing' ? <Loader2 className="size-4 animate-spin" /> : state.phase === 'downloading' ? <Loader2 className="size-4 animate-spin text-primary" /> : state.phase === 'completed' ? <Check className="size-4 text-emerald-400" /> : state.phase === 'failed' ? <RotateCcw className="size-4" /> : <Download className="size-4" />}
        </button>
      </div>
    </article>
  )
}
