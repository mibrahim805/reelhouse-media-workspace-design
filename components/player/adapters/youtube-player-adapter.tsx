'use client'

import { forwardRef, useEffect, useImperativeHandle } from 'react'
import type { PlayerCommands } from '@/types/player'

export type YoutubePlayerAdapterHandle = PlayerCommands

/**
 * Online playback stays inside the watch page. The embedded YouTube player
 * owns its playback controls; the native extractor is reserved for the
 * separate offline playback path.
 */
export const YoutubePlayerAdapter = forwardRef<YoutubePlayerAdapterHandle, {
  videoId: string
  title?: string
  thumbnail?: string
  autoPlay?: boolean
  onReady?: (duration: number) => void
  onPlay?: () => void
  onPause?: () => void
  onEnded?: () => void
  onProgress?: (position: number, duration: number) => void
  onError?: (code: number) => void
}>(({ videoId, title = 'Online video', autoPlay = false, onReady }, ref) => {
  useImperativeHandle(ref, () => ({
    play: () => {},
    pause: () => {},
    seek: () => {},
    seekTo: () => {},
    getCurrentTime: () => 0,
    getDuration: () => 0,
    isPlaying: () => false,
    setVolume: () => {},
    setMuted: () => {},
    setPlaybackRate: () => {},
  }), [])

  useEffect(() => {
    onReady?.(0)
  }, [onReady])

  if (!videoId) {
    return <div className="flex size-full items-center justify-center bg-[#08070e] text-sm text-white/60">This video is unavailable.</div>
  }

  const query = new URLSearchParams({
    autoplay: autoPlay ? '1' : '0',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    color: 'white',
  })

  return (
    <iframe
      title={title}
      src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${query.toString()}`}
      className="size-full border-0 bg-black"
      allow="autoplay; encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  )
})
YoutubePlayerAdapter.displayName = 'YoutubePlayerAdapter'
