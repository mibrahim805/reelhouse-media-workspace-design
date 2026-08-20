'use client'

import { useEffect } from 'react'

export function usePlayerKeyboard({
  enabled = true,
  onToggle,
  onSeek,
  onMute,
  onFullscreen,
}: {
  enabled?: boolean
  onToggle: () => void
  onSeek: (seconds: number) => void
  onMute: () => void
  onFullscreen: () => void
}) {
  useEffect(() => {
    if (!enabled) return
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return
      if (event.code === 'Space') { event.preventDefault(); onToggle() }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); onSeek(-10) }
      else if (event.key === 'ArrowRight') { event.preventDefault(); onSeek(10) }
      else if (event.key.toLowerCase() === 'm') { event.preventDefault(); onMute() }
      else if (event.key.toLowerCase() === 'f') { event.preventDefault(); onFullscreen() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, onFullscreen, onMute, onSeek, onToggle])
}
