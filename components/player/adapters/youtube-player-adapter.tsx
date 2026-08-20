'use client'

import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import type { PlayerCommands } from '@/types/player'

type YoutubeApi = { Player: new (element: HTMLElement, options: Record<string, unknown>) => YoutubeInstance }
type YoutubeInstance = { playVideo: () => void; pauseVideo: () => void; seekTo: (seconds: number, allowSeekAhead: boolean) => void; setVolume: (volume: number) => void; mute: () => void; unMute: () => void; setPlaybackRate: (rate: number) => void; getCurrentTime: () => number; getDuration: () => number; destroy: () => void }
type YoutubeWindow = Window & { YT?: YoutubeApi; onYouTubeIframeAPIReady?: () => void }
let apiPromise: Promise<YoutubeApi> | null = null

function loadYoutubeApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('YouTube API requires a browser'))
  const current = window as YoutubeWindow
  if (current.YT) return Promise.resolve(current.YT)
  if (!apiPromise) apiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]')
    const previous = current.onYouTubeIframeAPIReady
    current.onYouTubeIframeAPIReady = () => { previous?.(); if (current.YT) resolve(current.YT); else reject(new Error('YouTube API unavailable')) }
    if (!existing) { const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; script.async = true; script.onerror = () => reject(new Error('Unable to load YouTube API')); document.head.appendChild(script) }
  })
  return apiPromise
}

export type YoutubePlayerAdapterHandle = PlayerCommands

export const YoutubePlayerAdapter = forwardRef<YoutubePlayerAdapterHandle, {
  videoId: string
  autoPlay?: boolean
  onReady?: (duration: number) => void
  onPlay?: () => void
  onPause?: () => void
  onEnded?: () => void
  onProgress?: (position: number, duration: number) => void
  onError?: (code: number) => void
}>(({ videoId, autoPlay = false, onReady, onPlay, onPause, onEnded, onProgress, onError }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YoutubeInstance | null>(null)
  const timerRef = useRef<number | null>(null)
  const readyTimerRef = useRef<number | null>(null)
  useImperativeHandle(ref, () => ({
    play: () => playerRef.current?.playVideo(),
    pause: () => playerRef.current?.pauseVideo(),
    seek: seconds => { const player = playerRef.current; if (player && typeof player.getCurrentTime === 'function') player.seekTo(Math.max(0, player.getCurrentTime() + seconds), true) },
    setVolume: volume => playerRef.current?.setVolume(Math.round(volume * 100)),
    setMuted: muted => muted ? playerRef.current?.mute() : playerRef.current?.unMute(),
    setPlaybackRate: rate => playerRef.current?.setPlaybackRate(rate),
  }), [])
  useEffect(() => {
    let disposed = false
    void loadYoutubeApi().then(YT => {
      if (disposed || !containerRef.current) return
      playerRef.current?.destroy()
      playerRef.current = new YT.Player(containerRef.current, { videoId, host: 'https://www.youtube.com', playerVars: { autoplay: autoPlay ? 1 : 0, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, origin: window.location.origin, widget_referrer: window.location.href }, events: {
        onReady: (event: { target: YoutubeInstance }) => {
          if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current)
          onReady?.(event.target.getDuration())
          if (timerRef.current) window.clearInterval(timerRef.current)
          timerRef.current = window.setInterval(() => {
            const player = playerRef.current
            if (player && typeof player.getCurrentTime === 'function' && typeof player.getDuration === 'function') onProgress?.(player.getCurrentTime(), player.getDuration())
          }, 500)
        },
        onStateChange: (event: { data: number; target: YoutubeInstance }) => {
          if (event.data === 1) onPlay?.()
          else if (event.data === 2) onPause?.()
          else if (event.data === 0) onEnded?.()
        },
        onError: (event: { data: number }) => onError?.(event.data),
      } })
      readyTimerRef.current = window.setTimeout(() => onError?.(153), 8000)
    }).catch(() => onError?.(0))
    return () => { disposed = true; if (timerRef.current) window.clearInterval(timerRef.current); if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current); playerRef.current?.destroy(); playerRef.current = null }
  }, [autoPlay, onEnded, onError, onPause, onPlay, onProgress, onReady, videoId])
  return <div ref={containerRef} className="size-full" aria-label="YouTube video player" />
})
YoutubePlayerAdapter.displayName = 'YoutubePlayerAdapter'
