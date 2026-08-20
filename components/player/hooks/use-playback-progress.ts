'use client'

import { useCallback, useEffect, useRef } from 'react'

export function usePlaybackProgress({
  sourceId,
  position,
  duration,
  onPersist,
}: {
  sourceId?: string
  position: number
  duration: number
  onPersist: (position: number, duration: number) => void
}) {
  const lastPersisted = useRef(0)
  const persist = useCallback(() => {
    if (!sourceId || !Number.isFinite(position)) return
    if (Math.abs(position - lastPersisted.current) < 2 && duration > 0) return
    lastPersisted.current = position
    onPersist(position, duration)
  }, [duration, onPersist, position, sourceId])

  useEffect(() => {
    const timer = window.setInterval(persist, 2000)
    return () => window.clearInterval(timer)
  }, [persist])

  useEffect(() => () => persist(), [persist])
  return persist
}
