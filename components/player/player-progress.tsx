'use client'

export function PlayerProgress({ position, duration, onSeek }: { position: number; duration: number; onSeek: (value: number) => void }) {
  const value = duration > 0 ? Math.min(100, (position / duration) * 100) : 0
  return <input aria-label="Playback position" type="range" min={0} max={Math.max(duration, 0)} step={0.1} value={Math.min(position, duration || position)} onChange={event => onSeek(Number(event.target.value))} className="h-1.5 w-full cursor-pointer accent-violet-500" style={{ background: `linear-gradient(to right, #8b5cf6 ${value}%, #3a3a3a ${value}%)` }} />
}
