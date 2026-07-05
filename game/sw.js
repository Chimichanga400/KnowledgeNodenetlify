/* Emerald Estates service worker — scoped to /game/ only.
   Network-first with cache fallback, so updates ship instantly but the
   game still loads with no connection. Never touches the parent app. */
const CACHE = 'emerald-estates-v1';
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('emerald-estates-') && k !== CACHE)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    try {
      const fresh = await fetch(e.request);
      const cache = await caches.open(CACHE);
      cache.put(e.request, fresh.clone());
      return fresh;
    } catch (_) {
      const cached = await caches.match(e.request, { ignoreSearch: true });
      return cached || caches.match('./index.html');
    }
  })());
});
