/**
 * sw.js — NEUTERED / SELF-UNREGISTERING
 *
 * Earlier builds shipped a service worker whose precache list referenced files
 * that were later deleted, causing the SW install to fail and, in some browsers,
 * leaving a broken SW stuck in control of the page — which made the whole app
 * appear dead (no buttons worked) because every asset was served from a corrupt
 * cache.
 *
 * This stub does the opposite of caching: on install it immediately takes over,
 * deletes every cache, and unregisters itself. After one load the app runs with
 * NO service worker at all — every file loads fresh from the server. Offline
 * support is intentionally sacrificed to guarantee the app always loads.
 */
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (_) {}
    try {
      await self.clients.claim();
      await self.registration.unregister();
      const clients = await self.clients.matchAll();
      clients.forEach(c => c.navigate(c.url));
    } catch (_) {}
  })());
});

// Never intercept fetches — always go to network.
