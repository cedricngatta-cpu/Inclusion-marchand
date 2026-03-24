// Service Worker Julaba — PWA offline optimise
const CACHE_NAME = 'julaba-v3';
const STATIC_CACHE = 'julaba-static-v3';
const IMG_CACHE = 'julaba-img-v1';

// App shell a pre-cacher
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install : cache l'app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate : nettoie les anciens caches
self.addEventListener('activate', (event) => {
  const validCaches = [CACHE_NAME, STATIC_CACHE, IMG_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !validCaches.includes(k)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Limite la taille d'un cache (LRU simple)
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await cache.delete(keys[0]);
    return trimCache(cacheName, maxItems);
  }
}

// Fetch : strategie selon le type de requete
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignorer les requetes non-GET
  if (event.request.method !== 'GET') return;

  // Ignorer les requetes socket.io et websocket
  if (url.pathname.startsWith('/socket.io')) return;

  // Navigations (pages) : network-first, fallback sur le cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', clone));
          return response;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Assets statiques JS/CSS : stale-while-revalidate (rapide + a jour)
  if (url.pathname.match(/\.(js|css)$/) || url.pathname.startsWith('/_expo/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => cached);

          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Images et fonts locales : cache-first
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|ico|webp|woff|woff2|ttf|eot)$/)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => new Response('', { status: 404 }));
        })
      )
    );
    return;
  }

  // Images Supabase Storage : cache-first avec limite de taille
  if (url.hostname.includes('supabase.co') && (url.pathname.includes('/storage/') || url.pathname.includes('/render/'))) {
    event.respondWith(
      caches.open(IMG_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
              // Limiter le cache images a 100 entrees
              trimCache(IMG_CACHE, 100);
            }
            return response;
          }).catch(() => new Response('', { status: 404 }));
        })
      )
    );
    return;
  }

  // API Supabase REST : network-first avec fallback cache
  if (url.hostname.includes('supabase.co') && url.pathname.startsWith('/rest/')) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // API Supabase Auth : network-only (pas de cache)
  if (url.hostname.includes('supabase.co') && url.pathname.startsWith('/auth/')) {
    return;
  }

  // Tout le reste : network-only
  event.respondWith(
    fetch(event.request).catch(() => new Response('', { status: 404 }))
  );
});
