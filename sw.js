/**
 * SPHEREx Service Worker for Offline Planetarium / Educational Use
 * Caches core interactive application files and textures for offline exploration.
 */

const CACHE_NAME = 'spherex-cache-v50';
// The whole app is one bundle (three.js included), so these files are all it needs offline.
const OFFLINE_URLS = [
  './',
  './index.html',
  './css/base.css',
  './css/header.css',
  './css/sky.css',
  './css/explorer.css',
  './css/dialogs.css',
  './css/intro.css',
  './css/story.css',
  './css/hero.css',
  './js/ui.bundle.js',
  './manifest.json',
  './assets/sky_stars.jpg',
  './assets/sky_dust.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS).catch((err) => {
        console.warn('SPHEREx offline cache pre-fetch warning:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/')) return;
  // Network-first for HTML, JS, CSS so updates and code changes reflect immediately
  const isCodeAsset = event.request.mode === 'navigate' || 
                      event.request.url.endsWith('.html') || 
                      event.request.url.includes('.js') || 
                      event.request.url.includes('.css');

  if (isCodeAsset) {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for large celestial sky textures & cutouts
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        return cachedResponse;
      });
    })
  );
});
