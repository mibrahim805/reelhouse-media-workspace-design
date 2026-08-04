'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize2, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from 'lucide-react'

type YouTubePlayer = {
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getCurrentTime: () => number
  getDuration: () => number
  getVolume: () => number
  setVolume: (volume: number) => void
  mute: () => void
  unMute: () => void
  isMuted: () => boolean
  getPlaybackRate: () => number
  setPlaybackRate: (rate: number) => void
  destroy: () => void
}

type YouTubeApi = {
  Player: new (element: HTMLElement, options: Record<string, unknown>) => YouTubePlayer
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number; BUFFERING: number; CUED: number }
}

declare global {
  interface Window { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void }
}

type Props = { videoId: string; title: string; thumbnail?: string }

let apiPromise: Promise<YouTubeApi> | null = null

function loadYouTubeApi(): Promise<YouTubeApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('YouTube is unavailable.'))
  if (window.YT) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      if (window.YT) resolve(window.YT)
      else reject(new Error('YouTube player API did not initialize.'))
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => reject(new Error('Could not load the YouTube player.'))
    document.head.appendChild(script)
  })
  return apiPromise
}

function timeLabel(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00'
  const seconds = Math.floor(value)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function YouTubePreviewPlayer({ videoId, title, thumbnail }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YouTubePlayer | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [ready, setReady] = useState(false)
  const [state, setState] = useState<'loading' | 'paused' | 'playing' | 'ended' | 'error'>('loading')
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(100)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [error, setError] = useState('')

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  const updateTime = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    setCurrent(player.getCurrentTime())
    setDuration(player.getDuration())
  }, [])

  const startTimer = useCallback(() => {
    stopTimer()
    timerRef.current = setInterval(updateTime, 500)
  }, [stopTimer, updateTime])

  useEffect(() => {
    let disposed = false
    loadYouTubeApi().then((YT) => {
      if (disposed || !hostRef.current) return
      const player = new YT.Player(hostRef.current, {
        videoId,
        playerVars: { controls: 1, rel: 0, modestbranding: 1, playsinline: 1, enablejsapi: 1 },
        events: {
          onReady: () => {
            if (disposed) return
            playerRef.current = player
            setReady(true)
            setState('paused')
            setDuration(player.getDuration())
            setVolume(player.getVolume())
          },
          onStateChange: (event: { data: number }) => {
            if (disposed) return
            if (event.data === YT.PlayerState.PLAYING) { setState('playing'); startTimer() }
            else if (event.data === YT.PlayerState.ENDED) { stopTimer(); updateTime(); setState('ended') }
            else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.CUED) { stopTimer(); updateTime(); setState('paused') }
          },
          onError: (event: { data: number }) => { stopTimer(); setState('error'); setError(`YouTube playback error (${event.data}).`) },
        },
      })
      playerRef.current = player
    }).catch((reason: Error) => { if (!disposed) { setState('error'); setError(reason.message) } })

    return () => {
      disposed = true
      stopTimer()
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [videoId, startTimer, stopTimer, updateTime])

  const playerAction = (action: (player: YouTubePlayer) => void) => {
    if (playerRef.current && ready) action(playerRef.current)
  }

  return (
    <div className="w-full overflow-hidden rounded-2xl bg-black">
      <div className="relative aspect-video w-full">
        <div ref={hostRef} className="h-full w-full" aria-label={title} />
        {!ready && state !== 'error' && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white">Loading player…</div>}
        {state === 'error' && <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-sm text-white">{error}</div>}
      </div>
      <div className="space-y-2 border-t border-white/10 bg-zinc-950 p-3 text-white">
        <input aria-label="Playback progress" type="range" min={0} max={duration || 0} step={0.1} value={Math.min(current, duration || 0)} disabled={!ready || !duration} onChange={(event) => { const value = Number(event.target.value); setCurrent(value); playerAction((p) => p.seekTo(value, true)) }} className="w-full accent-red-500" />
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button aria-label={state === 'playing' ? 'Pause' : state === 'ended' ? 'Replay' : 'Play'} disabled={!ready} onClick={() => playerAction((p) => state === 'playing' ? p.pauseVideo() : state === 'ended' ? (p.seekTo(0, true), p.playVideo()) : p.playVideo())} className="rounded p-1.5 hover:bg-white/10 disabled:opacity-40">{state === 'playing' ? <Pause className="size-4" /> : state === 'ended' ? <RotateCcw className="size-4" /> : <Play className="size-4" />}</button>
          <button aria-label="Seek backward 10 seconds" disabled={!ready} onClick={() => playerAction((p) => p.seekTo(Math.max(0, p.getCurrentTime() - 10), true))} className="rounded p-1.5 hover:bg-white/10 disabled:opacity-40"><RotateCcw className="size-4" /></button>
          <button aria-label="Seek forward 10 seconds" disabled={!ready} onClick={() => playerAction((p) => p.seekTo(Math.min(p.getDuration(), p.getCurrentTime() + 10), true))} className="rounded p-1.5 hover:bg-white/10 disabled:opacity-40"><RotateCw className="size-4" /></button>
          <span className="tabular-nums">{timeLabel(current)} / {timeLabel(duration)}</span>
          <button aria-label={muted ? 'Unmute' : 'Mute'} disabled={!ready} onClick={() => playerAction((p) => { if (p.isMuted()) { p.unMute(); setMuted(false) } else { p.mute(); setMuted(true) } })} className="rounded p-1.5 hover:bg-white/10 disabled:opacity-40">{muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button>
          <input aria-label="Volume" type="range" min={0} max={100} value={muted ? 0 : volume} disabled={!ready} onChange={(event) => { const value = Number(event.target.value); setVolume(value); setMuted(value === 0); playerAction((p) => { p.setVolume(value); if (value > 0) p.unMute() }) }} className="w-20 accent-red-500" />
          <select aria-label="Playback speed" value={rate} disabled={!ready} onChange={(event) => { const value = Number(event.target.value); setRate(value); playerAction((p) => p.setPlaybackRate(value)) }} className="rounded bg-white/10 px-1.5 py-1 text-xs"><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={1.25}>1.25×</option><option value={1.5}>1.5×</option><option value={2}>2×</option></select>
          <button aria-label="Fullscreen" onClick={() => hostRef.current?.parentElement?.parentElement?.requestFullscreen()} className="ml-auto rounded p-1.5 hover:bg-white/10"><Maximize2 className="size-4" /></button>
        </div>
      </div>
      {thumbnail && <span className="sr-only">Preview thumbnail available</span>}
    </div>
  )
}
