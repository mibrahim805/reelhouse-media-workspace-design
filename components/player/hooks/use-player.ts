'use client'

import { useMedia } from '@/components/media-state'

/** Player-facing state and commands without exposing adapter implementation details. */
export function usePlayer() {
  return useMedia()
}
