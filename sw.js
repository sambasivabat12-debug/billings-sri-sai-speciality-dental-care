/**
 * Service Worker — Sri Sai Speciality Dental Care PWA
 * Strategy: Cache-first for app shell, network-first for CDN libs
 */

const CACHE_NAME = 'srisai-dental-v2';
const CDN_CACHE  = 'srisai-cdn-v2';

// Core app shell files (always cache)
const APP_SHELL = [
  './index.html',
  './manifest.json'
];

// CDN resources to cache on first fetch
const CDN_ORIGINS = [
  'cdnjs.cloudflare.com'
];

// ── Install: pre-cache app shell ──────────────────────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(APP_SHELL);
    }).then(function() {
      return self.skipWaiting(); // Activate immediately
    })
  );
});

// ── Activate: remove old caches ───────────────────────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(key) {
            return key !== CACHE_NAME && key !== CDN_CACHE;
          })
          .map(function(key) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(function() {
      return self.clients.claim(); // Take control of all pages
    })
  );
});

// ── Fetch: serve from cache or network ───────────────────────────────────
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension and non-http(s)
  if (!url.protocol.startsWith('http')) return;

  // CDN resources: cache-first with network fallback
  var isCDN = CDN_ORIGINS.some(function(origin) {
    return url.hostname.includes(origin);
  });

  if (isCDN) {
    event.respondWith(
      caches.open(CDN_CACHE).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) return cached;
          return fetch(event.request).then(function(response) {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(function() {
            return new Response('CDN resource unavailable offline', { status: 503 });
          });
        });
      })
    );
    return;
  }

  // App shell: cache-first
  var isAppShell = url.origin === self.location.origin;
  if (isAppShell) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) {
            // Refresh cache in background (stale-while-revalidate)
            fetch(event.request).then(function(response) {
              if (response && response.status === 200) {
                cache.put(event.request, response.clone());
              }
            }).catch(function() {});
            return cached;
          }
          // Not in cache — fetch and store
          return fetch(event.request).then(function(response) {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(function() {
            // Offline fallback: serve index.html for navigation requests
            if (event.request.mode === 'navigate') {
              return cache.match('./index.html');
            }
            return new Response('Offline', { status: 503 });
          });
        });
      })
    );
    return;
  }
});

// ── Message: force update from UI ─────────────────────────────────────────
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
