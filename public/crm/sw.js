// Tador Leads service worker — network-first, no offline cache.
// Bump VERSION on every deploy so installed apps update themselves.
const VERSION = 'leads-1.2.0';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || e.request.url.includes('/crm/api/')) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
