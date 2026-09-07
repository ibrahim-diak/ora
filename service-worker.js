const CACHE_NAME = 'luma-cache-v2';

const STATIC_ASSETS = [
  './',
  './index.html',
  './login.html',
  './chat.html',
  './profile.html',
  './css/style.css',
  './css/login.css',
  './css/chat.css',
  './manifest.json',
  './public/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Certains assets statiques n\'ont pu être mis en cache immédiat:', err);
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
  // Ignorer les requêtes non-GET et les requêtes externes Firestore/Auth
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (
    url.origin.includes('firestore.googleapis.com') ||
    url.origin.includes('firebase') ||
    url.origin.includes('identitytoolkit') ||
    url.origin.includes('securetoken')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html') || caches.match('./chat.html');
        }
      });
    })
  );
});
