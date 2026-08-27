'use client'

import { Maximize, Pause, Play, RotateCcw, RotateCw } from 'lucide-react'
import { useMedia } from '@/components/media-state'
import { PlayerProgress } from '@/components/player/player-progress'

const QUALITY_OPTIONS = [
  { value: 'default', label: 'Auto' },
  { value: 'small', label: '240p' },
  { value: 'medium', label: '360p' },
  { value: 'large', label: '480p' },
  { value: 'hd720', label: '720p' },
  { value: 'hd1080', label: '1080p' },
  { value: 'highres', label: 'Max' },
]

function formatTime(value: number) {
  if (!Number.isFinite(value)) return '0:00'
  const minutes = Math.floor(value / 60)
  return `${minutes}:${Math.floor(value % 60).toString().padStart(2, '0')}`
}

export function PlayerControls({ fullscreen }: { fullscreen?: () => void }) {
  const { source, playing, position, duration, playbackRate, setPlaybackRate, setQuality, play, pause, seek } = useMedia()
  const toggle = () => playing ? pause() : play()

  return (
    <div className="space-y-3 rounded-b-2xl border border-t-0 border-[#292929] bg-[#151515] p-3">
      <PlayerProgress position={position} duration={duration} onSeek={value => seek(value - position)} />
      <div className="flex items-center gap-2 text-white">
        <button onClick={() => seek(-10)} className="flex size-9 items-center justify-center rounded-lg hover:bg-[#1d1d1d]" aria-label="Rewind 10 seconds">
          <RotateCcw className="size-4" />
        </button>
        <button onClick={toggle} className="flex size-10 items-center justify-center rounded-full bg-primary text-white" aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
        </button>
        <button onClick={() => seek(10)} className="flex size-9 items-center justify-center rounded-lg hover:bg-[#1d1d1d]" aria-label="Forward 10 seconds">
          <RotateCw className="size-4" />
        </button>
        <span className="ml-1 text-[11px] tabular-nums text-[#a3a3a3]">{formatTime(position)} / {formatTime(duration)}</span>
        <select
          aria-label="Playback speed"
          value={playbackRate}
          onChange={event => setPlaybackRate(Number(event.target.value))}
          className="ml-auto h-8 rounded-lg border border-[#292929] bg-[#1d1d1d] px-1 text-[11px] text-white"
        >
          <option value={0.5}>0.5×</option>
          <option value={0.75}>0.75×</option>
          <option value={1}>1×</option>
          <option value={1.25}>1.25×</option>
          <option value={1.5}>1.5×</option>
          <option value={1.75}>1.75×</option>
          <option value={2}>2×</option>
        </select>
        {source?.type === 'youtube' && (
          <select
            aria-label="Video quality"
            defaultValue="default"
            onChange={event => setQuality(event.target.value)}
            className="h-8 rounded-lg border border-[#292929] bg-[#1d1d1d] px-1 text-[11px] text-white"
          >
            {QUALITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        )}
        <button onClick={fullscreen} className="flex size-9 items-center justify-center rounded-lg hover:bg-[#1d1d1d]" aria-label="Fullscreen">
          <Maximize className="size-4" />
        </button>
      </div>
    </div>
  )
}
