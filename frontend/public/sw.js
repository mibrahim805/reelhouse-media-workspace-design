self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Keep the app installable without caching video responses or stale API data.
self.addEventListener('fetch', () => {})
