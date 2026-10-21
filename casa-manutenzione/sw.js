// Service worker: tiene in cache la "shell" dell'app per l'uso offline.
// Le chiamate a Firebase non passano di qui (altro dominio).
const CACHE = 'casa-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'store.js', 'catalog.js',
  'firebase-config.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // network-first: aggiornamenti subito, cache come ripiego offline
  e.respondWith(fetch(req).then((res) => {
    const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res;
  }).catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
});
