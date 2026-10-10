export type NativePlayerState = {
  active: boolean
  key: string
  title: string
  thumbnail?: string
  online: boolean
  playing: boolean
  position: number
  duration: number
  speed: number
  ended: boolean
  buffering: boolean
  error?: string
}

type NativeWindow = Window & {
  ReelhouseAndroid?: { postMessage: (message: string) => void }
}

declare global {
  interface Window {
    ReelhouseAndroid?: { postMessage: (message: string) => void }
  }
}

export function isAndroidShell() {
  if (typeof window === 'undefined') return false
  return navigator.userAgent.includes('ReelhouseAndroid/') || Boolean((window as NativeWindow).ReelhouseAndroid)
}

export function postNativePlayerCommand(command: 'play' | 'pause' | 'close' | 'restore' | 'state' | 'seek' | 'speed', value?: number) {
  if (!isAndroidShell()) return false
  const bridge = window as NativeWindow
  bridge.ReelhouseAndroid?.postMessage(JSON.stringify({ type: 'native-player-command', command, ...(value === undefined ? {} : { value, seconds: value }) }))
  return true
}
