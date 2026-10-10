'use client'

import { useEffect } from 'react'

export function OfflineRuntime() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // Android renders the live hosted frontend. Registering the offline shell
    // there can make route changes show an old cached document before the live
    // page arrives, which feels like a slow or stale native UI.
    if (/ReelhouseAndroid\//i.test(navigator.userAgent)) {
      // Remove a registration left by an earlier Android build and clear its
      // document cache so the first live launch cannot show an old shell.
      void navigator.serviceWorker.getRegistrations().then(registrations => {
        void Promise.all(registrations.map(registration => registration.unregister()))
      })
      if ('caches' in window) {
        void caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
      }
      return
    }
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => {
      let items: Array<{ id?: string; filename?: string; qualityValue?: string; status?: string }> = []
      try { items = JSON.parse(localStorage.getItem('reelhouse.downloads') || '[]') } catch { return }
      for (const item of items) {
        if (item.status !== 'completed' || !item.id) continue
        const audio = item.qualityValue === 'audio' || /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(item.filename || '')
        void fetch(`${audio ? '/music/' : '/player/'}${encodeURIComponent(item.id)}`, { headers: { Accept: 'text/html' }, cache: 'no-store' }).catch(() => undefined)
      }
    }).catch(() => undefined)
  }, [])

  return null
}
