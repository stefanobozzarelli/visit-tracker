const CACHE_NAME = 'visit-tracker-v2';
const API_CACHE_NAME = 'visit-tracker-api-v2';

// Files to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Some files might fail, that's ok
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - Network first, then cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (let browser handle POST/PUT/DELETE normally)
  if (request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests (API calls go directly to backend)
  if (url.origin !== location.origin) {
    return;
  }

  // API calls: Network first, fallback to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const clonedResponse = response.clone();
            caches.open(API_CACHE_NAME).then((cache) => {
              cache.put(request, clonedResponse);
            });
          }
          return response;
        })
        .catch(() => {
          return caches
            .match(request)
            .then((cachedResponse) => {
              return cachedResponse || createOfflineResponse();
            });
        })
    );
  } else {
    // Static assets and SPA routes
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request)
          .then((response) => {
            if (!response || response.status !== 200) {
              return response;
            }
            const clonedResponse = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clonedResponse);
            });
            return response;
          })
          .catch(() => {
            // SPA fallback: for navigation requests (HTML pages), serve index.html
            // This is CRITICAL for offline SPA routing - /login, /dashboard, etc.
            if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
              return caches.match('/index.html').then((indexResponse) => {
                return indexResponse || createOfflineResponse();
              });
            }
            return createOfflineResponse();
          });
      })
    );
  }
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
