'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { DownloadItem } from '@/components/download-store'
import { useLibrary } from '@/components/library-store'
import type { PlayerCommands, PlayerSource, PlayerStatus } from '@/types/player'

type Playable = Pick<DownloadItem, 'id'|'title'|'thumbnail'|'fileUrl'|'filename'|'source'|'channel'>
type MediaState = {
  current: Playable | null
  source: PlayerSource | null
  playing: boolean
  position: number
  duration: number
  volume: number
  lastNonZeroVolume: number
  muted: boolean
  playbackRate: number
  status: PlayerStatus
  miniPlayerVisible: boolean
  open(item: Playable): void
  openOnline(source: Extract<PlayerSource, { type: 'youtube' }>): void
  close(): void
  setPlaying(value: boolean): void
  setPosition(value: number): void
  setDuration(value: number): void
  setVolume(value: number): void
  setMuted(value: boolean): void
  setPlaybackRate(value: number): void
  setQuality(value: string): void
  setStatus(value: PlayerStatus): void
  registerControls(controls: PlayerCommands): void
  clearControls(expected?: PlayerCommands): void
  play(): void
  pause(): void
  seek(seconds: number): void
}

const MediaContext = createContext<MediaState | null>(null)
const PLAYER_STATE_KEY = 'reelhouse.player-state'

function sourceIdentity(source: PlayerSource | null) {
  if (!source) return ''
  return source.type === 'youtube' ? `youtube:${source.videoId}` : `${source.type}:${source.id}:${source.src}`
}

export function MediaProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<Playable | null>(null)
  const [source, setSource] = useState<PlayerSource | null>(null)
  const [playing, setPlayingState] = useState(false)
  const [position, setPositionState] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(1)
  const [lastNonZeroVolume, setLastNonZeroVolume] = useState(1)
  const [muted, setMutedState] = useState(false)
  const [playbackRate, setPlaybackRateState] = useState(1)
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [, setControls] = useState<PlayerCommands | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const { recordPlay } = useLibrary()

  const currentRef = useRef(current)
  const sourceRef = useRef(source)
  const positionRef = useRef(position)
  const durationRef = useRef(duration)
  const volumeRef = useRef(volume)
  const lastNonZeroVolumeRef = useRef(lastNonZeroVolume)
  const mutedRef = useRef(muted)
  const playbackRateRef = useRef(playbackRate)
  const controlsRef = useRef<PlayerCommands | null>(null)
  const hydratedRef = useRef(false)
  const lastHistoryWriteRef = useRef(0)

  useEffect(() => {
    currentRef.current = current
    sourceRef.current = source
    positionRef.current = position
    durationRef.current = duration
    volumeRef.current = volume
    lastNonZeroVolumeRef.current = lastNonZeroVolume
    mutedRef.current = muted
    playbackRateRef.current = playbackRate
    hydratedRef.current = hydrated
  }, [current, duration, hydrated, lastNonZeroVolume, muted, playbackRate, position, source, volume])

  const persistProgress = useCallback((id: string, progress: number, force = false) => {
    const now = Date.now()
    if (!force && now - lastHistoryWriteRef.current < 2000) return
    lastHistoryWriteRef.current = now
    recordPlay(id, Math.max(0, progress))
  }, [recordPlay])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PLAYER_STATE_KEY)
      if (saved) {
        const state = JSON.parse(saved) as {
          current?: Playable
          source?: PlayerSource
          position?: number
          duration?: number
          volume?: number
          lastNonZeroVolume?: number
          muted?: boolean
          playbackRate?: number
        }
        if (state.current) setCurrent(state.current)
        if (state.source) setSource(state.source)
        if (typeof state.position === 'number') setPositionState(Math.max(0, state.position))
        if (typeof state.duration === 'number') setDuration(Math.max(0, state.duration))
        if (typeof state.volume === 'number') setVolumeState(Math.max(0, Math.min(1, state.volume)))
        if (typeof state.lastNonZeroVolume === 'number') setLastNonZeroVolume(Math.max(0.01, Math.min(1, state.lastNonZeroVolume)))
        if (typeof state.muted === 'boolean') setMutedState(state.muted)
        if (typeof state.playbackRate === 'number' && Number.isFinite(state.playbackRate)) setPlaybackRateState(state.playbackRate)
      }
    } catch {
      // Player state is best-effort and must never prevent the app from loading.
    } finally {
      setHydrated(true)
    }
  }, [])

  const persistState = useCallback(() => {
    if (!hydratedRef.current) return
    try {
      localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify({
        current: currentRef.current,
        source: sourceRef.current,
        position: positionRef.current,
        duration: durationRef.current,
        volume: volumeRef.current,
        lastNonZeroVolume: lastNonZeroVolumeRef.current,
        muted: mutedRef.current,
        playbackRate: playbackRateRef.current,
      }))
    } catch {
      // Persistence is optional.
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const interval = window.setInterval(persistState, 2000)
    const flush = () => persistState()
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      flush()
    }
  }, [hydrated, persistState])

  const open = useCallback((item: Playable) => {
    const audio = /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(item.filename || '') || item.source.toLowerCase() === 'audio'
    const nextSource: PlayerSource = audio
      ? { type: 'local-audio', id: item.id, title: item.title, src: item.fileUrl || '', artwork: item.thumbnail, artist: item.channel }
      : { type: 'local-video', id: item.id, title: item.title, src: item.fileUrl || '', thumbnail: item.thumbnail, channel: item.channel }
    const sameSession = currentRef.current?.id === item.id && sourceIdentity(sourceRef.current) === sourceIdentity(nextSource)

    setCurrent(item)
    setSource(nextSource)
    if (sameSession) return

    setPositionState(0)
    setDuration(0)
    setPlayingState(true)
    setStatus('loading')
    persistProgress(item.id, 0, true)
  }, [persistProgress])

  const openOnline = useCallback((next: Extract<PlayerSource, { type: 'youtube' }>) => {
    const sameSession = sourceRef.current?.type === 'youtube' && sourceRef.current.videoId === next.videoId
    setCurrent(null)
    setSource(previous => previous?.type === 'youtube' && previous.videoId === next.videoId ? { ...previous, ...next } : next)
    if (sameSession) return

    setPositionState(0)
    setDuration(0)
    setPlayingState(false)
    setStatus('loading')
    persistProgress(next.videoId, 0, true)
  }, [persistProgress])

  const close = useCallback(() => {
    persistState()
    setCurrent(null)
    setSource(null)
    setPlayingState(false)
    setPositionState(0)
    setDuration(0)
    setStatus('idle')
    controlsRef.current = null
    setControls(null)
  }, [persistState])

  const setPlaying = useCallback((value: boolean) => {
    setPlayingState(value)
    setStatus(value ? 'playing' : 'paused')
    if (!value) {
      const active = sourceRef.current
      if (active) persistProgress(active.type === 'youtube' ? active.videoId : active.id, positionRef.current, true)
    }
  }, [persistProgress])

  const setPosition = useCallback((value: number) => {
    const next = Number.isFinite(value) ? Math.max(0, value) : 0
    setPositionState(next)
    const active = sourceRef.current
    if (active) persistProgress(active.type === 'youtube' ? active.videoId : active.id, next)
  }, [persistProgress])

  const setVolume = useCallback((value: number) => {
    const next = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1))
    setVolumeState(next)
    if (next > 0) setLastNonZeroVolume(next)
    controlsRef.current?.setVolume(next)
  }, [])

  const setMuted = useCallback((value: boolean) => {
    if (!value && volumeRef.current <= 0) {
      const restored = Math.max(0.01, lastNonZeroVolumeRef.current)
      setVolumeState(restored)
      controlsRef.current?.setVolume(restored)
    }
    setMutedState(value)
    controlsRef.current?.setMuted(value)
  }, [])

  const setPlaybackRate = useCallback((value: number) => {
    const next = Number.isFinite(value) && value > 0 ? value : 1
    setPlaybackRateState(next)
    controlsRef.current?.setPlaybackRate(next)
  }, [])

  const setQuality = useCallback((value: string) => {
    controlsRef.current?.setQuality?.(value)
  }, [])

  const registerControls = useCallback((next: PlayerCommands) => {
    controlsRef.current = next
    setControls(next)
    next.setVolume(volumeRef.current)
    next.setMuted(mutedRef.current)
    next.setPlaybackRate(playbackRateRef.current)
  }, [])

  const clearControls = useCallback((expected?: PlayerCommands) => {
    if (expected && controlsRef.current !== expected) return
    controlsRef.current = null
    setControls(currentControls => expected && currentControls !== expected ? currentControls : null)
  }, [])

  const play = useCallback(() => {
    void controlsRef.current?.play()
    setPlayingState(true)
    setStatus('playing')
  }, [])

  const pause = useCallback(() => {
    controlsRef.current?.pause()
    setPlaying(false)
  }, [setPlaying])

  const seek = useCallback((seconds: number) => {
    const active = controlsRef.current
    if (!active) return
    active.seek(seconds)
    const next = Math.max(0, Math.min(durationRef.current || Infinity, active.getCurrentTime() || positionRef.current + seconds))
    setPosition(next)
  }, [setPosition])

  const value = useMemo(() => ({
    current, source, playing, position, duration, volume, lastNonZeroVolume, muted, playbackRate, status,
    miniPlayerVisible: Boolean(source), open, openOnline, close, setPlaying, setPosition, setDuration, setVolume,
    setMuted, setPlaybackRate, setQuality, setStatus, registerControls, clearControls, play, pause, seek,
  }), [clearControls, close, current, duration, lastNonZeroVolume, muted, open, openOnline, pause, playbackRate, play, playing, position, registerControls, seek, setMuted, setPlaybackRate, setPlaying, setPosition, setQuality, setVolume, source, status, volume])

  return <MediaContext.Provider value={value}>{children}</MediaContext.Provider>
}

export function useMedia() {
  const value = useContext(MediaContext)
  if (!value) throw new Error('useMedia must be used within MediaProvider')
  return value
}
