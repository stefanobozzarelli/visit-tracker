const CACHE_NAME = 'visit-tracker-v9';
const API_CACHE_NAME = 'visit-tracker-api-v9';

// Files to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install event - cache static assets individually (don't let one failure break all)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of STATIC_ASSETS) {
        try {
          await cache.add(asset);
          console.log('[SW] Cached:', asset);
        } catch (err) {
          console.warn('[SW] Failed to cache:', asset, err.message);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests (API calls to Railway go through axios interceptor)
  if (url.origin !== location.origin) {
    return;
  }

  // Navigation requests: ALWAYS network-first
  // Critical: also cache response under '/index.html' key so SPA offline fallback works
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone1 = response.clone();
          const clone2 = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            // Cache under the actual request URL
            cache.put(request, clone1);
            // ALSO always cache under /index.html for SPA offline fallback
            cache.put(new Request('/index.html'), clone2);
          });
          return response;
        })
        .catch(() => {
          // Offline: try exact URL first, then /index.html, then /
          return caches.match(request)
            .then((exact) => {
              if (exact) return exact;
              return caches.match('/index.html');
            })
            .then((html) => {
              if (html) return html;
              return caches.match('/');
            })
            .then((root) => {
              return root || createOfflineResponse();
            });
        })
    );
    return;
  }

  // Hashed assets (JS/CSS with content hash): cache-first (safe because hash changes per build)
  if (url.pathname.match(/\.[a-f0-9]{8,}\.(js|css)$/)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((response) => {
          if (response.status === 200) {
            const clonedResponse = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clonedResponse);
            });
          }
          return response;
        }).catch(() => createOfflineResponse());
      })
    );
    return;
  }

  // All other static assets: network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.status === 200) {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clonedResponse);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          return cachedResponse || createOfflineResponse();
        });
      })
  );
});

// Handle messages from client
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function createOfflineResponse() {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Offline - no cached data available',
    }),
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'application/json',
      }),
    }
  );
}
