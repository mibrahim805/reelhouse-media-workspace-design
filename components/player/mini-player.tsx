'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef } from 'react'
import { Pause, Play, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useMedia } from '@/components/media-state'
import { LocalAudioPlayerAdapter, type LocalAudioPlayerAdapterHandle } from '@/components/player/adapters/local-audio-player-adapter'
import { LocalVideoPlayerAdapter, type LocalVideoPlayerAdapterHandle } from '@/components/player/adapters/local-video-player-adapter'
import { YoutubePlayerAdapter, type YoutubePlayerAdapterHandle } from '@/components/player/adapters/youtube-player-adapter'
import { saveResumePosition } from '@/components/player/resume-position'
import type { PlayerCommands } from '@/types/player'
import { isAndroidShell } from '@/lib/native-player-bridge'

function playerHref(source: NonNullable<ReturnType<typeof useMedia>['source']>) {
  if (source.type === 'youtube') return `/watch/${encodeURIComponent(source.videoId)}`
  return source.type === 'local-audio' ? `/music/${encodeURIComponent(source.id)}` : `/player/${encodeURIComponent(source.id)}`
}

export function MiniPlayer() {
  const media = useMedia()
  const { playing, position, duration, volume, muted, playbackRate, status, setDuration, setPlaying, setPosition, setStatus, registerControls, clearControls, play, pause, close } = media
  const pathname = usePathname()
  const source = media.source
  const videoRef = useRef<LocalVideoPlayerAdapterHandle>(null)
  const audioRef = useRef<LocalAudioPlayerAdapterHandle>(null)
  const youtubeRef = useRef<YoutubePlayerAdapterHandle>(null)
  const activeControlsRef = useRef<PlayerCommands | null>(null)
  const sessionRef = useRef({ playing, position, volume, muted, playbackRate })
  useEffect(() => { sessionRef.current = { playing, position, volume, muted, playbackRate } }, [muted, playbackRate, playing, position, volume])
  const isFullPlayer = pathname.startsWith('/watch/') || (!isAndroidShell() && (pathname.startsWith('/player/') || pathname.startsWith('/music/')))
  const sourceType = source?.type
  const sourceKey = source ? `${source.type}:${source.type === 'youtube' ? source.videoId : source.id}` : ''
  const onReady = useCallback((duration: number) => {
    const controls = sourceType === 'youtube' ? youtubeRef.current : sourceType === 'local-video' ? videoRef.current : audioRef.current
    const session = sessionRef.current
    setDuration(duration)
    if (controls) {
      controls.setVolume(session.volume)
      controls.setMuted(session.muted)
      controls.setPlaybackRate(session.playbackRate)
      if (session.position > 0 && Number.isFinite(session.position)) controls.seekTo(Math.min(session.position, duration || session.position))
      if (session.playing) void controls.play()
      else controls.pause()
    }
  }, [setDuration, sourceType])
  const onPlay = useCallback(() => setPlaying(true), [setPlaying])
  const onPause = useCallback(() => setPlaying(false), [setPlaying])
  const onEnded = useCallback(() => setPlaying(false), [setPlaying])
  const onProgress = useCallback((position: number, duration: number) => { setPosition(position); if (duration) setDuration(duration) }, [setDuration, setPosition])
  const onError = useCallback(() => setStatus('error'), [setStatus])

  const capturePosition = useCallback(() => {
    const controls = activeControlsRef.current
    if (!controls) return
    const currentTime = controls.getCurrentTime()
    const duration = controls.getDuration()
    if (Number.isFinite(currentTime)) {
      setPosition(currentTime)
      saveResumePosition(sourceKey, currentTime)
    }
    if (Number.isFinite(duration) && duration > 0) setDuration(duration)
  }, [setDuration, setPosition, sourceKey])

  useEffect(() => {
    if (!source || isFullPlayer) return
    const controls = source.type === 'youtube' ? youtubeRef.current : source.type === 'local-video' ? videoRef.current : audioRef.current
    if (controls) {
      activeControlsRef.current = controls
      registerControls(controls)
    }
    return () => {
      if (!controls) return
      const currentTime = controls.getCurrentTime()
      const duration = controls.getDuration()
      if (Number.isFinite(currentTime)) {
        setPosition(currentTime)
        saveResumePosition(sourceKey, currentTime)
      }
      if (Number.isFinite(duration) && duration > 0) setDuration(duration)
      setPlaying(controls.isPlaying())
      if (activeControlsRef.current === controls) activeControlsRef.current = null
      clearControls(controls)
    }
  }, [clearControls, isFullPlayer, registerControls, setDuration, setPlaying, setPosition, source, sourceKey, sourceType])

  if (!source || isFullPlayer || status === 'ended' || status === 'error') return null

  const title = source.title || media.current?.title || 'Now playing'
  const artwork = source.type === 'youtube' ? source.thumbnail : source.type === 'local-audio' ? source.artwork : source.thumbnail
  const progress = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0

  const miniEngine = isAndroidShell() ? null : source.type === 'youtube' ? <YoutubePlayerAdapter ref={youtubeRef} videoId={source.videoId} title={source.title} thumbnail={source.thumbnail} onReady={onReady} onPlay={onPlay} onPause={onPause} onEnded={onEnded} onProgress={onProgress} onError={onError} /> : source.type === 'local-video' ? <LocalVideoPlayerAdapter ref={videoRef} id={source.id} title={source.title} src={source.src} poster={source.thumbnail} onReady={onReady} onPlay={onPlay} onPause={onPause} onEnded={onEnded} onProgress={onProgress} onError={onError} /> : <LocalAudioPlayerAdapter ref={audioRef} src={source.src} onReady={onReady} onPlay={onPlay} onPause={onPause} onEnded={onEnded} onProgress={onProgress} onError={onError} />

  return (
    <aside className="mini-player fixed inset-x-3 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+8px)] z-40 mx-auto flex h-16 max-w-xl items-center gap-3 overflow-hidden rounded-2xl border border-[#292929] bg-[#151515]/95 px-2 shadow-2xl backdrop-blur-xl md:bottom-4 md:left-auto md:right-4 md:mx-0 md:w-96" aria-label="Mini player">
      <div className="mini-player-engine absolute size-px overflow-hidden opacity-0" aria-hidden="true">{miniEngine}</div>
      <Link href={playerHref(source)} onClick={capturePosition} className="mini-player-art relative h-12 w-20 shrink-0 overflow-hidden rounded-xl bg-[#1d1d1d]">
        <span className="mini-player-art-fallback absolute inset-0 flex items-center justify-center bg-[#25262c] text-white/75">
          <Play className="ml-0.5 size-4 fill-current" />
        </span>
        {artwork ? <img src={artwork} alt="" className="absolute inset-0 size-full object-cover" onError={event => { event.currentTarget.style.display = 'none' }} /> : null}
        <span className="mini-player-art-overlay absolute inset-0 flex items-center justify-center bg-black/20">
          {playing ? <Pause className="size-4 fill-white text-white" /> : <Play className="ml-0.5 size-4 fill-white text-white" />}
        </span>
      </Link>
      <Link href={playerHref(source)} onClick={capturePosition} className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{title}</p>
        <p className="truncate text-xs text-[#a3a3a3]">{source.type === 'youtube' ? source.channel || 'YouTube' : source.type === 'local-audio' ? source.artist || 'Audio' : source.channel || 'Downloaded video'}</p>
      </Link>
      <button onClick={() => playing ? pause() : play()} className="flex size-9 items-center justify-center rounded-full border border-[#292929] text-white hover:bg-[#1d1d1d]" aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
      </button>
      <button onClick={close} className="flex size-9 items-center justify-center rounded-full border border-[#292929] text-[#a3a3a3] hover:bg-[#1d1d1d] hover:text-white" aria-label="Close">
        <X className="size-4" />
      </button>
      <span className="mini-player-progress absolute inset-x-0 bottom-0 h-0.5 bg-white/10" aria-hidden="true">
        <span className="block h-full bg-primary" style={{ width: `${progress}%` }} />
      </span>
    </aside>
  )
}
