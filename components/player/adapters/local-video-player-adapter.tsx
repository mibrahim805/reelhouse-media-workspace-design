'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { PlayerCommands } from '@/types/player'
import { isAndroidShell, postNativePlayerCommand, type NativePlayerState } from '@/lib/native-player-bridge'

export type LocalVideoPlayerAdapterHandle = PlayerCommands & { element: HTMLVideoElement | null }

export const LocalVideoPlayerAdapter = forwardRef<LocalVideoPlayerAdapterHandle, {
  src: string
  id?: string
  title?: string
  poster?: string
  autoPlay?: boolean
  onReady?: (duration: number) => void
  onPlay?: () => void
  onPause?: () => void
  onEnded?: () => void
  onProgress?: (position: number, duration: number) => void
  onError?: () => void
  onBuffering?: (buffering: boolean) => void
}>(({ src, id = src, title = 'Offline video', poster, autoPlay, onReady, onPlay, onPause, onEnded, onProgress, onError, onBuffering }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const stateRef = useRef<NativePlayerState | null>(null)
  const [nativeRequested, setNativeRequested] = useState(false)
  const android = isAndroidShell()
  const nativeKey = `local-video:${id}`

  const launchNativePlayer = () => {
    if (!android || nativeRequested) return
    setNativeRequested(true)
    onPlay?.()
    window.ReelhouseAndroid?.postMessage(JSON.stringify({ type: 'native-video-playback', url: src, key: nativeKey, title, thumbnail: poster, position: stateRef.current?.position || 0 }))
  }

  useImperativeHandle(ref, () => ({
    element: videoRef.current,
    play: () => {
      if (android) {
        if (nativeRequested) postNativePlayerCommand('play')
        else launchNativePlayer()
      } else {
        return videoRef.current?.play()
      }
    },
    pause: () => android ? postNativePlayerCommand('pause') : videoRef.current?.pause(),
    seek: seconds => android ? postNativePlayerCommand('seek', seconds) : videoRef.current && (videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.duration || Infinity, videoRef.current.currentTime + seconds))),
    seekTo: seconds => android ? postNativePlayerCommand('seek', seconds - (stateRef.current?.position || 0)) : videoRef.current && (videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.duration || Infinity, seconds))),
    getCurrentTime: () => android ? stateRef.current?.position || 0 : videoRef.current?.currentTime || 0,
    getDuration: () => android ? stateRef.current?.duration || 0 : videoRef.current?.duration || 0,
    isPlaying: () => android ? Boolean(stateRef.current?.playing || nativeRequested) : Boolean(videoRef.current && !videoRef.current.paused),
    setVolume: volume => { if (videoRef.current) videoRef.current.volume = volume },
    setMuted: muted => { if (videoRef.current) videoRef.current.muted = muted },
    setPlaybackRate: rate => android ? postNativePlayerCommand('speed', rate) : videoRef.current && (videoRef.current.playbackRate = rate),
    fullscreen: () => { void videoRef.current?.requestFullscreen?.() },
  }), [android, id, nativeRequested, poster, src, title])

  useEffect(() => {
    if (!android) return
    const handleNativeState = (event: Event) => {
      const detail = (event as CustomEvent<NativePlayerState>).detail
      if (!detail || detail.key !== nativeKey) return
      stateRef.current = detail
      setNativeRequested(detail.active)
      if (detail.duration > 0) onReady?.(detail.duration)
      onProgress?.(detail.position, detail.duration)
      onBuffering?.(detail.buffering)
      if (detail.playing) {
        onPlay?.()
      } else {
        onPause?.()
      }
      if (detail.ended) onEnded?.()
      if (detail.error) onError?.()
      if (!detail.active) stateRef.current = null
    }
    window.addEventListener('reelhouse-native-player-state', handleNativeState)
    return () => window.removeEventListener('reelhouse-native-player-state', handleNativeState)
  }, [android, nativeKey, onBuffering, onEnded, onError, onPause, onPlay, onProgress, onReady])

  if (android) {
    return <button type="button" onClick={launchNativePlayer} className="flex size-full items-center justify-center bg-black" aria-label="Play offline video">
      {poster ? <img src={poster} alt="" className="absolute inset-0 size-full object-cover opacity-50" /> : null}
      <span className="relative rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white">{autoPlay ? 'Open player' : 'Play video'}</span>
    </button>
  }

  return <video ref={videoRef} src={src} poster={poster} autoPlay={autoPlay} playsInline preload="metadata" className="size-full object-contain" onLoadedMetadata={e => onReady?.(e.currentTarget.duration)} onPlay={onPlay} onPause={onPause} onEnded={onEnded} onTimeUpdate={e => onProgress?.(e.currentTarget.currentTime, e.currentTarget.duration)} onWaiting={() => onBuffering?.(true)} onCanPlay={() => onBuffering?.(false)} onError={onError} controls={false} />
})
LocalVideoPlayerAdapter.displayName = 'LocalVideoPlayerAdapter'
