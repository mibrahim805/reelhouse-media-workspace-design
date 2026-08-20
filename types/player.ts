export type PlayerSource =
  | {
      type: 'youtube'
      videoId: string
      title: string
      thumbnail?: string
      channel?: string
    }
  | {
      type: 'local-video'
      id: string
      title: string
      src: string
      thumbnail?: string
      channel?: string
    }
  | {
      type: 'local-audio'
      id: string
      title: string
      src: string
      artwork?: string
      artist?: string
    }

export type PlayerStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error'

export type PlayerCommands = {
  play: () => void | Promise<void>
  pause: () => void
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  setMuted: (muted: boolean) => void
  setPlaybackRate: (rate: number) => void
  fullscreen?: () => void
}
