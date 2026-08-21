'use client'

import { forwardRef, useImperativeHandle, useRef } from 'react'
import type { PlayerCommands } from '@/types/player'

export type LocalVideoPlayerAdapterHandle = PlayerCommands & { element: HTMLVideoElement | null }

export const LocalVideoPlayerAdapter = forwardRef<LocalVideoPlayerAdapterHandle, {
  src: string
  poster?: string
  autoPlay?: boolean
  onReady?: (duration: number) => void
  onPlay?: () => void
  onPause?: () => void
  onEnded?: () => void
  onProgress?: (position: number, duration: number) => void
  onError?: () => void
  onBuffering?: (buffering: boolean) => void
}>(({ src, poster, autoPlay, onReady, onPlay, onPause, onEnded, onProgress, onError, onBuffering }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  useImperativeHandle(ref, () => ({
    element: videoRef.current,
    play: () => videoRef.current?.play(),
    pause: () => videoRef.current?.pause(),
    seek: seconds => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.duration || Infinity, videoRef.current.currentTime + seconds)) },
    seekTo: seconds => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.duration || Infinity, seconds)) },
    getCurrentTime: () => videoRef.current?.currentTime || 0,
    getDuration: () => videoRef.current?.duration || 0,
    isPlaying: () => Boolean(videoRef.current && !videoRef.current.paused),
    setVolume: volume => { if (videoRef.current) videoRef.current.volume = volume },
    setMuted: muted => { if (videoRef.current) videoRef.current.muted = muted },
    setPlaybackRate: rate => { if (videoRef.current) videoRef.current.playbackRate = rate },
    fullscreen: () => { void videoRef.current?.requestFullscreen?.() },
  }), [])
  return <video ref={videoRef} src={src} poster={poster} autoPlay={autoPlay} playsInline preload="metadata" className="size-full object-contain" onLoadedMetadata={e => onReady?.(e.currentTarget.duration)} onPlay={onPlay} onPause={onPause} onEnded={onEnded} onTimeUpdate={e => onProgress?.(e.currentTarget.currentTime, e.currentTarget.duration)} onWaiting={() => onBuffering?.(true)} onCanPlay={() => onBuffering?.(false)} onError={onError} controls={false} />
})
LocalVideoPlayerAdapter.displayName = 'LocalVideoPlayerAdapter'
