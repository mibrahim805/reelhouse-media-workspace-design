'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // PWA installation is optional; the web app remains fully usable if
      // the browser blocks service workers.
    })
  }, [])

  return null
}
