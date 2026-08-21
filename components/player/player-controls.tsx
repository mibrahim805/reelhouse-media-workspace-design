'use client'

import { Maximize, MicOff, Mic, Minus, Pause, Play, Plus, RotateCcw, RotateCw, Volume2 } from 'lucide-react'
import { useMedia } from '@/components/media-state'
import { PlayerProgress } from '@/components/player/player-progress'

function formatTime(value: number) { if (!Number.isFinite(value)) return '0:00'; const minutes = Math.floor(value / 60); return `${minutes}:${Math.floor(value % 60).toString().padStart(2, '0')}` }

export function PlayerControls({ fullscreen }: { fullscreen?: () => void }) {
  const { playing, position, duration, volume, muted, playbackRate, setVolume, setMuted, setPlaybackRate, play, pause, seek } = useMedia()
  const rates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
  const changeRate = (direction: -1 | 1) => {
    const currentIndex = rates.findIndex(rate => rate === playbackRate)
    const nextIndex = Math.max(0, Math.min(rates.length - 1, (currentIndex < 0 ? rates.indexOf(1) : currentIndex) + direction))
    setPlaybackRate(rates[nextIndex])
  }
  const toggle = () => playing ? pause() : play()
  return <div className="space-y-3 rounded-b-2xl border border-t-0 border-[#292929] bg-[#151515] p-3"><PlayerProgress position={position} duration={duration} onSeek={value => seek(value - position)} /><div className="flex items-center gap-2 text-white"><button onClick={() => seek(-10)} className="flex size-9 items-center justify-center rounded-lg hover:bg-[#1d1d1d]" aria-label="Rewind 10 seconds"><RotateCcw className="size-4" /></button><button onClick={toggle} className="flex size-10 items-center justify-center rounded-full bg-primary text-white" aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}</button><button onClick={() => seek(10)} className="flex size-9 items-center justify-center rounded-lg hover:bg-[#1d1d1d]" aria-label="Forward 10 seconds"><RotateCw className="size-4" /></button><span className="ml-1 text-[11px] tabular-nums text-[#a3a3a3]">{formatTime(position)} / {formatTime(duration)}</span><button onClick={() => setMuted(!muted)} className="ml-auto flex size-9 items-center justify-center rounded-lg hover:bg-[#1d1d1d]" aria-label={muted ? 'Unmute' : 'Mute'}>{muted ? <MicOff className="size-4" /> : <Volume2 className="size-4" />}</button><input aria-label="Volume" type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={event => { setMuted(false); setVolume(Number(event.target.value)) }} className="hidden w-20 accent-violet-500 sm:block" /><button onClick={() => changeRate(-1)} className="flex size-7 items-center justify-center rounded-lg hover:bg-[#1d1d1d]" aria-label="Decrease playback speed"><Minus className="size-3" /></button><select aria-label="Playback speed" value={playbackRate} onChange={event => setPlaybackRate(Number(event.target.value))} className="h-8 rounded-lg border border-[#292929] bg-[#1d1d1d] px-1 text-[11px] text-white"><option value={0.5}>0.5×</option><option value={0.75}>0.75×</option><option value={1}>1×</option><option value={1.25}>1.25×</option><option value={1.5}>1.5×</option><option value={1.75}>1.75×</option><option value={2}>2×</option></select><button onClick={() => changeRate(1)} className="flex size-7 items-center justify-center rounded-lg hover:bg-[#1d1d1d]" aria-label="Increase playback speed"><Plus className="size-3" /></button><button onClick={fullscreen} className="flex size-9 items-center justify-center rounded-lg hover:bg-[#1d1d1d]" aria-label="Fullscreen"><Maximize className="size-4" /></button></div></div>
}
