'use client'

import { useEffect, useState, useCallback } from 'react'

/** Returns true if the browser reports it has internet connectivity. */
export function useNetworkStatus() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}

export type BackendStatus = 'checking' | 'online' | 'offline'

/**
 * Checks whether the Django backend proxy is actually reachable.
 * Re-checks whenever the browser's online/offline status changes.
 */
export function useBackendStatus(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>('checking')
  const networkOnline = useNetworkStatus()

  const check = useCallback(async () => {
    if (!navigator.onLine) {
      setStatus('offline')
      return
    }
    setStatus('checking')
    try {
      // Lightweight probe — just check if the proxy route returns something.
      // The SW will return {ok:false,error:'backend_offline'} when Django is down.
      const res = await fetch('/api/backend/health', {
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
      })
      const json = await res.json().catch(() => ({ ok: false })) as { ok?: boolean; error?: string }
      setStatus(json.ok === false && json.error === 'backend_offline' ? 'offline' : 'online')
    } catch {
      setStatus('offline')
    }
  }, [])

  useEffect(() => {
    void check()
  }, [check, networkOnline])

  return status
}
