'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { DownloadItem } from '@/components/download-store'
import { useLibrary } from '@/components/library-store'
import type { PlayerCommands, PlayerSource, PlayerStatus } from '@/types/player'

type Playable = Pick<DownloadItem, 'id'|'title'|'thumbnail'|'fileUrl'|'filename'|'source'|'channel'>
type MediaState = {
  current: Playable | null; source: PlayerSource | null; playing: boolean; position: number; duration: number; volume: number; muted: boolean; playbackRate: number; status: PlayerStatus; miniPlayerVisible: boolean
  open: (item: Playable) => void; openOnline: (source: Extract<PlayerSource, { type: 'youtube' }>) => void; close: () => void; setPlaying: (value: boolean) => void; setPosition: (value: number) => void; setDuration: (value: number) => void; setVolume: (value: number) => void; setMuted: (value: boolean) => void; setPlaybackRate: (value: number) => void; setStatus: (value: PlayerStatus) => void; registerControls: (controls: PlayerCommands) => void; clearControls: () => void; play: () => void; pause: () => void; seek: (seconds: number) => void
}
const MediaContext = createContext<MediaState | null>(null)

export function MediaProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<Playable | null>(null)
  const [source, setSource] = useState<PlayerSource | null>(null)
  const [playing, setPlayingState] = useState(false)
  const [position, setPositionState] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [controls, setControls] = useState<PlayerCommands | null>(null)
  const { recordPlay } = useLibrary()

  useEffect(() => {
    try {
      const saved = localStorage.getItem('reelhouse.player-state')
      if (!saved) return
      const state = JSON.parse(saved) as { current?: Playable; source?: PlayerSource; position?: number; duration?: number; volume?: number; muted?: boolean; playbackRate?: number }
      if (state.current) setCurrent(state.current); if (state.source) setSource(state.source); if (typeof state.position === 'number') setPositionState(state.position); if (typeof state.duration === 'number') setDuration(state.duration); if (typeof state.volume === 'number') setVolume(state.volume); if (typeof state.muted === 'boolean') setMuted(state.muted); if (typeof state.playbackRate === 'number') setPlaybackRate(state.playbackRate)
    } catch { /* persistence is optional */ }
  }, [])
  useEffect(() => { try { localStorage.setItem('reelhouse.player-state', JSON.stringify({ current, source, position, duration, volume, muted, playbackRate })) } catch { /* persistence is optional */ } }, [current, source, position, duration, volume, muted, playbackRate])

  const open = useCallback((item: Playable) => {
    const audio = /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(item.filename || '') || item.source.toLowerCase() === 'audio'
    setCurrent(item); setSource(audio ? { type: 'local-audio', id: item.id, title: item.title, src: item.fileUrl || '', artwork: item.thumbnail, artist: item.channel } : { type: 'local-video', id: item.id, title: item.title, src: item.fileUrl || '', thumbnail: item.thumbnail, channel: item.channel }); setPositionState(0); setDuration(0); setPlayingState(true); setStatus('loading'); recordPlay(item.id)
  }, [recordPlay])
  const openOnline = useCallback((next: Extract<PlayerSource, { type: 'youtube' }>) => { setCurrent(null); setSource(next); setPositionState(0); setDuration(0); setPlayingState(false); setStatus('loading'); recordPlay(next.videoId, 0) }, [recordPlay])
  const close = useCallback(() => { setCurrent(null); setSource(null); setPlayingState(false); setPositionState(0); setDuration(0); setStatus('idle'); setControls(null) }, [])
  const setPlaying = useCallback((value: boolean) => { setPlayingState(value); setStatus(value ? 'playing' : 'paused') }, [])
  const setPosition = useCallback((value: number) => { setPositionState(value); if (source) recordPlay(source.type === 'youtube' ? source.videoId : source.id, value) }, [recordPlay, source])
  const registerControls = useCallback((next: PlayerCommands) => setControls(next), [])
  const clearControls = useCallback(() => setControls(null), [])
  const play = useCallback(() => { void controls?.play(); setPlayingState(true); setStatus('playing') }, [controls])
  const pause = useCallback(() => { controls?.pause(); setPlayingState(false); setStatus('paused') }, [controls])
  const seek = useCallback((seconds: number) => { controls?.seek(seconds) }, [controls])
  const value = useMemo(() => ({ current, source, playing, position, duration, volume, muted, playbackRate, status, miniPlayerVisible: Boolean(source), open, openOnline, close, setPlaying, setPosition, setDuration, setVolume, setMuted, setPlaybackRate, setStatus, registerControls, clearControls, play, pause, seek }), [clearControls, close, current, duration, muted, open, openOnline, pause, playbackRate, play, playing, position, registerControls, seek, setPlaying, source, status, setPosition, volume])
  return <MediaContext.Provider value={value}>{children}</MediaContext.Provider>
}
export function useMedia() { const value = useContext(MediaContext); if (!value) throw new Error('useMedia must be used within MediaProvider'); return value }
