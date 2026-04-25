'use strict';

const CACHE_NAME = 'scanner-v1';

// オフラインで使いたいローカルアセット
const LOCAL_ASSETS = [
  './',
  './index.html',
  './style.css',
  './state.js',
  './utils.js',
  './storage.js',
  './scanner.js',
  './camera.js',
  './photos.js',
  './main.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// 外部CDN（キャッシュは試みるが失敗してもOK）
const EXTERNAL_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js',
  'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;600;700&display=swap',
];

/* ── インストール ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // ローカルアセットは必ずキャッシュ
      await cache.addAll(LOCAL_ASSETS);
      // 外部アセットはベストエフォート（失敗しても続行）
      await Promise.allSettled(
        EXTERNAL_ASSETS.map(url =>
          fetch(url, { mode: 'cors' })
            .then(res => res.ok ? cache.put(url, res) : null)
            .catch(() => null)
        )
      );
    })
  );
  self.skipWaiting();
});

/* ── アクティベート（古いキャッシュ削除） ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ── フェッチ戦略 ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // カメラ・マイクなどメディアストリームはキャッシュしない
  if (event.request.destination === 'video' ||
      event.request.destination === 'audio') {
    return;
  }

  // POSTリクエストはキャッシュしない
  if (event.request.method !== 'GET') return;

  // Google Fonts のCSSはネットワーク優先（失敗時はキャッシュ）
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // ローカルアセット・CDNはキャッシュ優先
  event.respondWith(cacheFirst(event.request));
});

/* キャッシュ優先 → ネットワーク fallback */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // 完全オフライン時はキャッシュのトップページを返す
    return caches.match('./index.html');
  }
}

/* ネットワーク優先 → キャッシュ fallback */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match('./index.html');
  }
}
