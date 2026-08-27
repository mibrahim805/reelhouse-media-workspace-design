'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Play } from 'lucide-react'
import { useMedia } from '@/components/media-state'
import { LocalAudioPlayerAdapter, type LocalAudioPlayerAdapterHandle } from '@/components/player/adapters/local-audio-player-adapter'
import { LocalVideoPlayerAdapter, type LocalVideoPlayerAdapterHandle } from '@/components/player/adapters/local-video-player-adapter'
import { YoutubePlayerAdapter, type YoutubePlayerAdapterHandle } from '@/components/player/adapters/youtube-player-adapter'
import { PlayerControls } from '@/components/player/player-controls'
import { usePlayerKeyboard } from '@/components/player/hooks/use-player-keyboard'
import type { PlayerSource } from '@/types/player'

export function ReelhousePlayer({ source, autoPlay = false }: { source: PlayerSource; autoPlay?: boolean }) {
  const { playing, position, volume, muted, playbackRate, status, setDuration, setPlaying, setPosition, setStatus, setVolume, setMuted, setPlaybackRate, registerControls, clearControls, play, pause, seek } = useMedia()
  const [showControls, setShowControls] = useState(true)
  const videoRef = useRef<LocalVideoPlayerAdapterHandle>(null)
  const audioRef = useRef<LocalAudioPlayerAdapterHandle>(null)
  const youtubeRef = useRef<YoutubePlayerAdapterHandle>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const clickTimer = useRef<number | null>(null)
  const adapter = source.type === 'youtube' ? youtubeRef : source.type === 'local-video' ? videoRef : audioRef
  const sourceId = source.type === 'youtube' ? source.videoId : source.id
  const sessionRef = useRef({ playing, position, volume, muted, playbackRate })
  const positionRef = useRef(position)
  const restoredSourceRef = useRef<string | null>(null)
  useEffect(() => { sessionRef.current = { playing, position, volume, muted, playbackRate } }, [muted, playbackRate, playing, position, volume])
  useEffect(() => { positionRef.current = position }, [position])

  const onReady = useCallback((length: number) => {
    const controls = adapter.current
    const session = sessionRef.current
    const startingPosition = positionRef.current
    setDuration(length)
    if (controls) {
      controls.setVolume(session.volume)
      controls.setMuted(session.muted)
      controls.setPlaybackRate(session.playbackRate)
      if (startingPosition > 0 && Number.isFinite(startingPosition)) {
        controls.seekTo(Math.min(startingPosition, length || startingPosition))
        restoredSourceRef.current = sourceId
      }
      if (session.playing) void controls.play()
      else controls.pause()
    }
    setStatus('ready')
  }, [adapter, setDuration, setStatus, sourceId])
  const onPlay = useCallback(() => setPlaying(true), [setPlaying])
  const onPause = useCallback(() => setPlaying(false), [setPlaying])
  const onEnded = useCallback(() => { setPlaying(false); setStatus('ended') }, [setPlaying, setStatus])
  const onProgress = useCallback((nextPosition: number, length: number) => { setPosition(nextPosition); if (length) setDuration(length) }, [setDuration, setPosition])
  const onError = useCallback(() => setStatus('error'), [setStatus])
  useEffect(() => {
    restoredSourceRef.current = null
  }, [sourceId])

  useEffect(() => {
    const controls = adapter.current
    if (!controls || position <= 0 || restoredSourceRef.current === sourceId) return
    const length = controls.getDuration()
    controls.seekTo(Math.min(position, length || position))
    restoredSourceRef.current = sourceId
  }, [adapter, position, sourceId])

  useEffect(() => {
    const controls = adapter.current
    if (controls) registerControls(controls)
    return () => {
      if (!controls) return
      const currentTime = controls.getCurrentTime()
      const length = controls.getDuration()
      if (Number.isFinite(currentTime)) setPosition(currentTime)
      if (Number.isFinite(length) && length > 0) setDuration(length)
      setPlaying(controls.isPlaying())
      clearControls(controls)
    }
  }, [adapter, clearControls, registerControls, setDuration, setPlaying, setPosition])
  useEffect(() => { setStatus('loading') }, [setStatus, source.type, sourceId])

  function handleSurfaceClick(event: React.MouseEvent<HTMLDivElement>) {
    if (source.type === 'youtube') return
    const bounds = surfaceRef.current?.getBoundingClientRect(); if (!bounds) return
    const now = Date.now(); const last = clickTimer.current
    if (last && now - last < 300) { clickTimer.current = null; seek(event.clientX < bounds.left + bounds.width / 2 ? -10 : 10); return }
    clickTimer.current = window.setTimeout(() => { clickTimer.current = null; setShowControls(value => !value) }, 250)
  }
  const fullscreen = useCallback(() => { if (source.type === 'local-video') videoRef.current?.fullscreen?.(); else surfaceRef.current?.requestFullscreen?.() }, [source.type])
  const togglePlayback = useCallback(() => { if (playing) pause(); else play() }, [pause, play, playing])
  const toggleMute = useCallback(() => setMuted(!muted), [muted, setMuted])
  usePlayerKeyboard({ enabled: true, onToggle: togglePlayback, onSeek: seek, onMute: toggleMute, onFullscreen: fullscreen })

  const frame = source.type === 'youtube' ? <YoutubePlayerAdapter ref={youtubeRef} videoId={source.videoId} autoPlay={autoPlay} onReady={onReady} onPlay={onPlay} onPause={onPause} onEnded={onEnded} onProgress={onProgress} onError={onError} /> : source.type === 'local-video' ? <LocalVideoPlayerAdapter ref={videoRef} src={source.src} poster={source.thumbnail} autoPlay={autoPlay && playing} onReady={onReady} onPlay={onPlay} onPause={onPause} onEnded={onEnded} onProgress={onProgress} onError={onError} /> : <><div className="flex size-full items-center justify-center bg-gradient-to-br from-[#25154d] via-[#151515] to-black"><img src={source.artwork || '/placeholder.svg'} alt="" className="size-48 rounded-2xl object-cover opacity-80 shadow-2xl" /><span className="absolute flex size-14 items-center justify-center rounded-full bg-primary text-white"><Play className="size-6 fill-current" /></span></div><LocalAudioPlayerAdapter ref={audioRef} src={source.src} autoPlay={autoPlay && playing} onReady={onReady} onPlay={onPlay} onPause={onPause} onEnded={onEnded} onProgress={onProgress} onError={onError} /></>

  return <div className="space-y-0"><div ref={surfaceRef} onClick={handleSurfaceClick} className={`relative aspect-video overflow-hidden bg-black ${source.type === 'local-audio' ? 'rounded-2xl' : 'rounded-t-2xl'}`}>{frame}{status === 'loading' && <span className="pointer-events-none absolute inset-0 flex items-center justify-center"><Loader2 className="size-7 animate-spin text-white" /></span>}{status === 'error' && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 text-center"><p className="text-sm font-semibold text-white">This media cannot be played here.</p>{source.type === 'youtube' && <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(source.videoId)}`} target="_blank" rel="noreferrer" className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black">Open on YouTube</a>}</div>}</div>{showControls && <PlayerControls fullscreen={fullscreen} />}</div>
}
