const VERSION = 'reelhouse-offline-v2'
const APP_CACHE = `${VERSION}-app`
const STATIC_CACHE = `${VERSION}-static`

// All shell routes that should be cached on install
const APP_ROUTES = [
  '/', '/downloads', '/library', '/library/videos', '/library/music',
  '/profile', '/history', '/favorites', '/playlists', '/storage',
  '/downloads/settings', '/search', '/explore',
]

// ── Offline stub responses ──────────────────────────────────────────────────

function offlineSearchResponse(url) {
  const searchParams = new URL(url).searchParams
  const query = searchParams.get('q') || ''
  return new Response(
    JSON.stringify({
      results: [],
      nextPageToken: null,
      totalResults: 0,
      query,
      configured: false,
      error: 'offline',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function offlineBackendResponse() {
  return new Response(
    JSON.stringify({ ok: false, error: 'backend_offline' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } },
  )
}

// ── Install — pre-cache app shell ───────────────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE)
    await Promise.all(APP_ROUTES.map(route => cache.add(route).catch(() => undefined)))
    await self.skipWaiting()
  })())
})

// ── Activate — evict old caches ─────────────────────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter(key => key !== APP_CACHE && key !== STATIC_CACHE)
        .map(key => caches.delete(key)),
    )
    await self.clients.claim()
  })())
})

// ── Fetch ───────────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  const path = url.pathname

  // 1. /api/search — network-first, return offline stub when network is down
  if (path.startsWith('/api/search')) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        return response
      } catch {
        return offlineSearchResponse(request.url)
      }
    })())
    return
  }

  // 2. /api/backend/* — network-first, return offline stub when network is down
  if (path.startsWith('/api/backend/') || path.startsWith('/api/app-download')) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        return response
      } catch {
        return offlineBackendResponse()
      }
    })())
    return
  }

  // 3. Next.js static assets + icons + thumbnails — cache-first
  if (
    path.startsWith('/_next/static/') ||
    path.startsWith('/icons/') ||
    path.startsWith('/thumbnails/')
  ) {
    event.respondWith((async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      try {
        const response = await fetch(request)
        if (response.ok) {
          const cache = await caches.open(STATIC_CACHE)
          cache.put(request, response.clone())
        }
        return response
      } catch {
        return cached || Response.error()
      }
    })())
    return
  }

  // 4. Navigation / HTML — network-first, fall back to cached shell
  const htmlRequest = request.headers.get('accept')?.includes('text/html')
  if (request.mode === 'navigate' || htmlRequest) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (response.ok) {
          const cache = await caches.open(APP_CACHE)
          cache.put(request, response.clone())
        }
        return response
      } catch {
        return (
          (await caches.match(request)) ||
          (await caches.match('/')) ||
          new Response('Offline', { status: 503 })
        )
      }
    })())
    return
  }

  // 5. Everything else — network only (don't intercept)
})
