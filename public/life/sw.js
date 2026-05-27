// Minimal service worker — cache-first for shell, network-fallthrough for the rest.
// Hand-written (no Workbox) so the whole PWA layer stays auditable.

const VERSION = 'life-v1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './src/main.js',
  './src/counter.js',
  './src/prompts.js',
  './src/share.js',
  './src/i18n.js',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only handle same-origin shell + assets; let fonts go straight to network with cache.
  if (url.origin !== location.origin && !url.hostname.endsWith('googleapis.com') && !url.hostname.endsWith('gstatic.com')) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Refresh in the background.
        fetch(req).then((fresh) => {
          if (fresh && fresh.ok) {
            caches.open(VERSION).then((cache) => cache.put(req, fresh.clone()));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then((resp) => {
        if (resp && resp.ok && (url.origin === location.origin || url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com'))) {
          const copy = resp.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
        }
        return resp;
      }).catch(() => {
        // Final fallback: serve the shell index for navigations so installed
        // PWA opens even when offline before everything is warm.
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('offline', { status: 503, statusText: 'offline' });
      });
    }),
  );
});
