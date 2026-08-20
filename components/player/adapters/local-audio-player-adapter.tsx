'use client'

import { forwardRef, useImperativeHandle, useRef } from 'react'
import type { PlayerCommands } from '@/types/player'

export type LocalAudioPlayerAdapterHandle = PlayerCommands & { element: HTMLAudioElement | null }

export const LocalAudioPlayerAdapter = forwardRef<LocalAudioPlayerAdapterHandle, {
  src: string
  autoPlay?: boolean
  onReady?: (duration: number) => void
  onPlay?: () => void
  onPause?: () => void
  onEnded?: () => void
  onProgress?: (position: number, duration: number) => void
  onError?: () => void
}>(({ src, autoPlay, onReady, onPlay, onPause, onEnded, onProgress, onError }, ref) => {
  const audioRef = useRef<HTMLAudioElement>(null)
  useImperativeHandle(ref, () => ({
    element: audioRef.current,
    play: () => audioRef.current?.play(),
    pause: () => audioRef.current?.pause(),
    seek: seconds => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, Math.min(audioRef.current.duration || Infinity, audioRef.current.currentTime + seconds)) },
    setVolume: volume => { if (audioRef.current) audioRef.current.volume = volume },
    setMuted: muted => { if (audioRef.current) audioRef.current.muted = muted },
    setPlaybackRate: rate => { if (audioRef.current) audioRef.current.playbackRate = rate },
  }), [])
  return <audio ref={audioRef} src={src} autoPlay={autoPlay} preload="metadata" onLoadedMetadata={e => onReady?.(e.currentTarget.duration)} onPlay={onPlay} onPause={onPause} onEnded={onEnded} onTimeUpdate={e => onProgress?.(e.currentTarget.currentTime, e.currentTarget.duration)} onError={onError} />
})
LocalAudioPlayerAdapter.displayName = 'LocalAudioPlayerAdapter'
