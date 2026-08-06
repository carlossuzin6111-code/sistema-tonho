// FitLife Sync - Service Worker for PWA Static Asset Caching

const CACHE_NAME = 'fitlife-cache-v20260805.5';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/desktop.html',
  '/mobile.html',
  '/manifest.webmanifest',
  '/css/style.css?v=20260805.5',
  '/css/mobile.css?v=20260805.5',
  '/vendor/lucide/lucide-1.25.0.min.js',
  '/js/router.js?v=20260805.5',
  '/js/api.js?v=20260805.5',
  '/js/safe-dom.js?v=20260805.5',
  '/js/datetime.js?v=20260805.5',
  '/js/app.js?v=20260805.5',
  '/js/personal.js?v=20260805.5',
  '/js/student.js?v=20260805.5',
  '/js/chat-actions.js?v=20260805.5',
  '/js/profile.js?v=20260805.5',
  '/js/events.js?v=20260805.5',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('PWA SW: Some static assets failed to pre-cache during install:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Never intercept non-GET requests or API endpoints (REST & SSE streams)
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback for offline navigation if network fails
        if (request.mode === 'navigate') {
          return caches.match('/index.html') || caches.match('/mobile.html') || caches.match('/desktop.html');
        }
        return null;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
