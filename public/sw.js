// public/sw.js
// Memomate Service Worker
// Handles caching + PUSH NOTIFICATIONS (FINAL FIX)

const CACHE_NAME = 'memomate-v2';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/favicon.ico',
];

// --------------------
// INSTALL
// --------------------
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(STATIC_ASSETS).catch(() => {})
    )
  );
});

// --------------------
// ACTIVATE
// --------------------
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

// --------------------
// FETCH
// --------------------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Always go network-first for APIs
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // Navigation requests
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/'))
    );
    return;
  }

  // Static assets
  if (req.method === 'GET') {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (!res || res.status !== 200) return res;
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        });
      })
    );
  }
});

// =================================================
// 🔔 PUSH NOTIFICATIONS (THIS IS THE IMPORTANT PART)
// =================================================
self.addEventListener('push', (event) => {
  let title = 'Memomate reminder';
  let body = 'You have a reminder';
  let url = '/';

  if (event.data) {
    try {
      const data = event.data.json();
      title = data.title || title;
      body = data.body || body;
      url = (data.data && data.data.url) || url;
    } catch (e) {
      try {
        body = event.data.text();
      } catch (e2) {
        body = 'You have a reminder';
      }
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url },
      vibrate: [100, 50, 100],
    })
  );
});

// --------------------
// NOTIFICATION CLICK
// --------------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
