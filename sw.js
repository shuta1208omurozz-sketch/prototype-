// FIX38: GitHub Pages / PWA cache reset service worker
// 以前のキャッシュが残ると、GitHubに上書きしても古いJS/CSSが表示されるため、常にネットワーク優先にします。
const CACHE_VERSION = 'scanner-camera-fix38-timebar-not-sticky';

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .catch(() => caches.match(event.request))
  );
});
