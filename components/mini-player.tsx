'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { Pause, Play, X } from 'lucide-react'
import { useMedia } from '@/components/media-state'

export function MiniPlayer() {
  const { current, playing, setPlaying, close } = useMedia()
  const pathname = usePathname()
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const media = ref.current
    if (!media) return
    if (playing) void media.play().catch(() => setPlaying(false))
    else media.pause()
  }, [playing, setPlaying, current])

  if (!current?.fileUrl) return null
  if (pathname.startsWith('/player/') || pathname.startsWith('/music/')) return null

  const isAudio = /\.(mp3|m4a|aac|wav|ogg)$/i.test(current.filename || '')
  const playerPath = isAudio ? '/music' : '/player'

  return (
    <aside
      className="fixed inset-x-3 bottom-[72px] z-40 mx-auto flex h-16 max-w-xl items-center gap-3 overflow-hidden rounded-2xl border border-[#292929] bg-[#151515]/95 px-2 shadow-2xl backdrop-blur-xl md:bottom-4 md:left-auto md:right-4 md:mx-0 md:w-96"
      aria-label="Mini player"
    >
      {/* thumbnail / waveform */}
      {isAudio ? (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15">
          <svg className="size-6 text-primary" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
          </svg>
        </div>
      ) : (
        <video
          ref={ref}
          src={current.fileUrl}
          poster={current.thumbnail || undefined}
          onEnded={() => setPlaying(false)}
          className="h-12 w-20 shrink-0 rounded-xl object-cover"
          playsInline
        />
      )}

      <Link href={`${playerPath}/${current.id}`} className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{current.title}</p>
        <p className="truncate text-xs text-[#a3a3a3]">{current.channel || current.source}</p>
      </Link>

      <button
        onClick={() => setPlaying(!playing)}
        className="flex size-9 items-center justify-center rounded-full border border-[#292929] text-white hover:bg-[#1d1d1d]"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
      </button>
      <button
        onClick={close}
        className="flex size-9 items-center justify-center rounded-full border border-[#292929] text-[#a3a3a3] hover:bg-[#1d1d1d] hover:text-white"
        aria-label="Close"
      >
        <X className="size-4" />
      </button>
    </aside>
  )
}
