'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Heart, ListMusic, MoreHorizontal, Pause, Play, Repeat2, Shuffle, SkipBack, SkipForward, Volume2 } from 'lucide-react'
import { useMedia } from '@/components/media-state'
import { LocalAudioPlayerAdapter, type LocalAudioPlayerAdapterHandle } from '@/components/player/adapters/local-audio-player-adapter'
import { clearResumePosition, readResumePosition } from '@/components/player/resume-position'
import { usePlayerKeyboard } from '@/components/player/hooks/use-player-keyboard'
import { PlayerProgress } from '@/components/player/player-progress'
import type { PlayerSource } from '@/types/player'

type AudioSource = Extract<PlayerSource, { type: 'local-audio' }>

function formatTime(value: number) {
  if (!Number.isFinite(value)) return '0:00'
  return `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, '0')}`
}

function WaterDropletArtwork({ artwork, title, playing }: { artwork?: string; title: string; playing: boolean }) {
  return (
    <div className={`music-artwork-shell ${playing ? 'is-playing' : ''}`}>
      <div className="music-artwork-shadow" />
      <div className="music-artwork-frame">
        {artwork ? (
          <img src={artwork} alt="" className="music-artwork" />
        ) : (
          <div className="music-artwork music-artwork-fallback" aria-hidden="true"><span>RH</span></div>
        )}
        <div className="music-liquid-wash" />
        <span className="music-droplet music-droplet-one" />
        <span className="music-droplet music-droplet-two" />
        <span className="music-droplet music-droplet-three" />
        <span className="music-droplet music-droplet-four" />
        <span className="music-droplet music-droplet-five" />
        <span className="music-droplet music-droplet-six" />
        <span className="music-artwork-shine" />
      </div>
      <span className="sr-only">Artwork for {title}</span>
    </div>
  )
}

export function ImmersiveAudioPlayer({ source, favorited, onToggleFavorite }: { source: AudioSource; favorited: boolean; onToggleFavorite: () => void }) {
  const { playing, position, duration, volume, muted, playbackRate, status, setDuration, setPlaying, setPosition, setStatus, setMuted, setPlaybackRate, registerControls, clearControls, play, pause, seek } = useMedia()
  const audioRef = useRef<LocalAudioPlayerAdapterHandle>(null)
  const sessionRef = useRef({ playing, position, volume, muted, playbackRate })
  const restoredSourceRef = useRef<string | null>(null)
  const [repeat, setRepeat] = useState(false)
  const [shuffle, setShuffle] = useState(false)
  const sourceId = `local-audio:${source.id}`

  useEffect(() => {
    sessionRef.current = { playing, position, volume, muted, playbackRate }
  }, [muted, playbackRate, playing, position, volume])

  const onReady = useCallback((length: number) => {
    const controls = audioRef.current
    const session = sessionRef.current
    const savedPosition = readResumePosition(sourceId)
    const startingPosition = savedPosition > 0 ? savedPosition : session.position
    setDuration(length)
    if (!controls) return
    controls.setVolume(session.volume)
    controls.setMuted(session.muted)
    controls.setPlaybackRate(session.playbackRate)
    if (startingPosition > 0 && Number.isFinite(startingPosition)) {
      controls.seekTo(Math.min(startingPosition, length || startingPosition))
      restoredSourceRef.current = sourceId
      clearResumePosition(sourceId)
    }
    if (session.playing) void controls.play()
    else controls.pause()
    setStatus('ready')
  }, [setDuration, setStatus, sourceId])

  const onPlay = useCallback(() => setPlaying(true), [setPlaying])
  const onPause = useCallback(() => setPlaying(false), [setPlaying])
  const onEnded = useCallback(() => {
    if (repeat) {
      audioRef.current?.seekTo(0)
      void audioRef.current?.play()
      return
    }
    setPlaying(false)
    setStatus('ended')
  }, [repeat, setPlaying, setStatus])
  const onProgress = useCallback((nextPosition: number, length: number) => {
    setPosition(nextPosition)
    if (length) setDuration(length)
  }, [setDuration, setPosition])
  const onError = useCallback(() => setStatus('error'), [setStatus])

  useEffect(() => { restoredSourceRef.current = null }, [sourceId])
  useEffect(() => {
    const controls = audioRef.current
    if (!controls || position <= 0 || restoredSourceRef.current === sourceId) return
    const length = controls.getDuration()
    controls.seekTo(Math.min(position, length || position))
    restoredSourceRef.current = sourceId
    clearResumePosition(sourceId)
  }, [position, sourceId])
  useEffect(() => {
    const controls = audioRef.current
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
  }, [clearControls, registerControls, setDuration, setPlaying, setPosition])
  useEffect(() => { setStatus('loading') }, [setStatus, sourceId])

  const togglePlayback = useCallback(() => { if (playing) pause(); else play() }, [pause, play, playing])
  const toggleMute = useCallback(() => setMuted(!muted), [muted, setMuted])
  const noFullscreen = useCallback(() => undefined, [])
  usePlayerKeyboard({ enabled: true, onToggle: togglePlayback, onSeek: seek, onMute: toggleMute, onFullscreen: noFullscreen })

  return (
    <div className="music-player-content">
      <WaterDropletArtwork artwork={source.artwork} title={source.title} playing={playing} />

      <div className="music-track-copy">
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-bold tracking-[-0.03em] text-white sm:text-2xl">{source.title}</h1>
          <p className="mt-1 truncate text-sm font-medium text-white/55">{source.artist || 'Downloaded audio'}</p>
        </div>
        <button onClick={onToggleFavorite} className={`music-icon-button ${favorited ? 'is-active' : ''}`} aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}>
          <Heart className="size-5" fill={favorited ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="music-progress-wrap">
        <PlayerProgress position={position} duration={duration} onSeek={value => seek(value - position)} />
        <div className="mt-2 flex justify-between text-[11px] font-medium tabular-nums text-white/45">
          <span>{formatTime(position)}</span><span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="music-main-controls">
        <button onClick={() => setShuffle(value => !value)} className={`music-secondary-button ${shuffle ? 'is-active' : ''}`} aria-label="Toggle shuffle"><Shuffle className="size-[18px]" /></button>
        <button onClick={() => seek(-10)} className="music-secondary-button" aria-label="Previous or rewind 10 seconds"><SkipBack className="size-[22px]" fill="currentColor" /></button>
        <button onClick={togglePlayback} className="music-play-button" aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause className="size-7" fill="currentColor" /> : <Play className="ml-1 size-7" fill="currentColor" />}
        </button>
        <button onClick={() => seek(10)} className="music-secondary-button" aria-label="Next or forward 10 seconds"><SkipForward className="size-[22px]" fill="currentColor" /></button>
        <button onClick={() => setRepeat(value => !value)} className={`music-secondary-button ${repeat ? 'is-active' : ''}`} aria-label="Toggle repeat"><Repeat2 className="size-[18px]" /></button>
      </div>

      <div className="music-bottom-actions">
        <button onClick={() => setMuted(!muted)} className="music-quiet-button" aria-label={muted ? 'Unmute' : 'Mute'}><Volume2 className="size-4" />{muted ? 'Muted' : 'Sound on'}</button>
        <button onClick={() => setPlaybackRate(playbackRate === 1 ? 1.25 : 1)} className="music-quiet-button" aria-label="Change playback speed">{playbackRate}×</button>
        <button className="music-quiet-button" aria-label="Open queue"><ListMusic className="size-4" /><span className="hidden sm:inline">Queue</span></button>
        <button className="music-quiet-button" aria-label="More options"><MoreHorizontal className="size-4" /></button>
      </div>

      <div className="absolute left-[-9999px] top-0 size-px overflow-hidden opacity-0" aria-hidden="true">
        <LocalAudioPlayerAdapter ref={audioRef} src={source.src} autoPlay onReady={onReady} onPlay={onPlay} onPause={onPause} onEnded={onEnded} onProgress={onProgress} onError={onError} />
      </div>

      {status === 'error' && <p className="mt-4 text-center text-xs text-rose-300">This track could not be played.</p>}
    </div>
  )
}
