const VERSION = 'my-yt-offline-v1'
const APP_CACHE = `${VERSION}-app`
const RUNTIME_CACHE = `${VERSION}-runtime`
const APP_ROUTES = [
  '/', '/downloads', '/library', '/library/videos', '/library/music',
  '/profile', '/history', '/favorites', '/playlists', '/storage',
  '/downloads/settings', '/search', '/explore',
]

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE)
    await Promise.all(APP_ROUTES.map(route => cache.add(route).catch(() => undefined)))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(key => key !== APP_CACHE && key !== RUNTIME_CACHE).map(key => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  const htmlRequest = request.headers.get('accept')?.includes('text/html')
  if (request.mode === 'navigate' || htmlRequest) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (response.ok) {
          const cache = await caches.open(APP_CACHE)
          await cache.put(request, response.clone())
        }
        return response
      } catch {
        return (await caches.match(request)) || (await caches.match('/')) || new Response('Offline', { status: 503 })
      }
    })())
    return
  }

  if (url.pathname.startsWith('/_next/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/thumbnails/')) {
    event.respondWith((async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      try {
        const response = await fetch(request)
        if (response.ok) (await caches.open(RUNTIME_CACHE)).put(request, response.clone())
        return response
      } catch {
        return cached || Response.error()
      }
    })())
  }
})
