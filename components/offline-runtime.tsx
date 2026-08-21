'use client'

import { useEffect } from 'react'

export function OfflineRuntime() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
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
