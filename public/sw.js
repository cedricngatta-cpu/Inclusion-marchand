// Service Worker Julaba — PWA offline complet
// Strategie : cache-first static, network-first data, cache-first images produits
const CACHE_STATIC  = 'julaba-static-v2';
const CACHE_DATA    = 'julaba-data-v1';
const CACHE_ASSETS  = 'julaba-assets-v1';

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
];

// ── Installation : pre-cache des ressources essentielles ──────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ── Activation : nettoyage des anciens caches ─────────────────────────────
self.addEventListener('activate', (event) => {
  const keepCaches = [CACHE_STATIC, CACHE_DATA, CACHE_ASSETS];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !keepCaches.includes(k)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Helpers ───────────────────────────────────────────────────────────────
function isStaticAsset(url) {
  const ext = url.pathname.split('.').pop();
  return ['js', 'css', 'woff', 'woff2', 'ttf', 'eot', 'svg'].includes(ext);
}

function isImageAsset(url) {
  const ext = url.pathname.split('.').pop();
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'ico'].includes(ext);
}

function isSupabaseData(url) {
  return url.hostname.includes('supabase');
}

function isSupabaseStorage(url) {
  return url.hostname.includes('supabase') && url.pathname.includes('/storage/');
}

function isSocketOrRealtime(url) {
  return url.pathname.startsWith('/socket.io') ||
         url.hostname.includes('groq.com') ||
         url.pathname.startsWith('/api/deepgram');
}

// ── Fetch : strategie par type de requete ─────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignorer les requetes non-GET (POST, PUT, etc.)
  if (event.request.method !== 'GET') return;

  // Socket.io, Groq, Deepgram : network-only, pas de cache
  if (isSocketOrRealtime(url)) return;

  // Images produits Supabase Storage : cache-first
  if (isSupabaseStorage(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_ASSETS).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // Donnees Supabase REST API : network-first avec fallback cache
  if (isSupabaseData(url)) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_DATA).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        return caches.match(event.request).then((cached) => {
          return cached || new Response(JSON.stringify({ data: [], error: 'offline' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        });
      })
    );
    return;
  }

  // Fichiers statiques (JS, CSS, fonts) : cache-first
  if (isStaticAsset(url) || isImageAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_STATIC).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // Navigation HTML et tout le reste : network-first, fallback app shell
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok && event.request.mode === 'navigate') {
        const clone = response.clone();
        caches.open(CACHE_STATIC).then((cache) => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => {
      return caches.match(event.request).then((cached) => {
        // Fallback : retourner l'app shell (/) pour les navigations
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});
