// public/sw.js
// Simple service worker with caching + push notification support
// Replace your existing sw.js with this file, then unregister old SWs and reload the page.
// DEPLOY TEST: PUSH HANDLER ACTIVE

const CACHE_NAME = 'memomate-v1';
const STATIC_ASSETS = [
  '/', 
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/favicon.ico'
  // Add any other static paths you want cached by default.
];

// Install - cache static assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        // ignore failures for individual URLs
        console.warn('SW cache.addAll failed:', err);
      });
    })
  );
});

// Activate - cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch - basic cache-first for same-origin navigation and static assets; network-first for /api/
self.addEventListener('fetch', (event) => {
  try {
    const req = event.request;
    const url = new URL(req.url);

    // Always try network for API routes (so dynamic data stays fresh)
    if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
      event.respondWith(
        fetch(req)
          .then((res) => {
            // optional: cache API responses here if you want
            return res;
          })
          .catch(() => caches.match(req))
      );
      return;
    }

    // For navigation requests, serve the cached shell if possible (fallback to network)
    if (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'))) {
      event.respondWith(
        caches.match(req).then((cached) => {
          return cached || fetch(req).then((res) => {
            // optionally cache navigation/html responses (not recommended for dynamic pages)
            return res;
          });
        }).catch(() => caches.match('/'))
      );
      return;
    }

    // For other GET requests (static assets), try cache first, then network and cache the result
    if (req.method === 'GET') {
      event.respondWith(
        caches.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req)
            .then((res) => {
              // don't cache opaque responses from cross-origin by default
              if (!res || res.status !== 200 || res.type === 'opaque') return res;
              const clone = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
              return res;
            })
            .catch(() => {
              // fallback to a cached asset if available
              return caches.match('/icons/icon-192.png');
            });
        })
      );
    }
  } catch (e) {
    // If something goes wrong, just let the request go to network
    console.error('SW fetch handler error', e);
  }
});

/* ---------- PUSH NOTIFICATION HANDLERS ---------- */
self.addEventListener('push', function(event) {
  let payload = {};
  try {
    if (event.data) payload = event.data.json();
  } catch (e) {
    try {
      // try plain text
      if (event.data && typeof event.data.text === 'function') {
        payload = { title: 'Memomate reminder', body: event.data.text() };
      } else {
        payload = { title: 'Memomate reminder', body: 'You have a reminder.' };
      }
    } catch (e2) {
      payload = { title: 'Memomate reminder', body: 'You have a reminder.' };
    }
  }

  const title = payload.title || 'Memomate reminder';
  const body = payload.body || 'You have a reminder due in Memomate.';
  const url = (payload.data && payload.data.url) || '/';

  const options = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        // If a window with the url is already open, focus it.
        try {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        } catch (e) {
          // client.url access may throw in some contexts; ignore
        }
      }
      // Otherwise open a new window/tab.
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
