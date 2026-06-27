// ============================================================
// RIDE TRACKER - Service Worker (cache offline + mises à jour)
// ============================================================

// IMPORTANT : incrémenter CACHE_VERSION à chaque déploiement qui touche CSS/JS.
// Le bump force la suppression complète de l'ancien cache (event 'activate'),
// donc un visuel mis à jour ne reste jamais coincé derrière une version en cache.
const CACHE_VERSION = 'v12';
const CACHE_NAME = 'ride-tracker-' + CACHE_VERSION;

const ASSETS = [
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/db.js',
  './js/devices.js',
  './js/calc.js',
  './js/charts.js',
  './js/i18n.js',
  './js/version.js',
  './js/trips.js',
  './js/maintenance.js',
  './js/settings.js',
  './js/csv-io.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .catch(() => {})
  );
  // Ne PAS appeler skipWaiting ici : on attend le signal explicite de l'utilisateur
  // (bouton "Redémarrer") pour activer la nouvelle version. Voir message 'SKIP_WAITING'.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Message envoyé par l'app quand l'utilisateur clique "Redémarrer"
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  const isHTML = event.request.mode === 'navigate' || event.request.url.endsWith('.html') || event.request.url.endsWith('/');

  if (isHTML) {
    // Network-first pour le HTML : garantit qu'on a toujours un document valide,
    // et qu'on détecte vite une nouvelle version. Fallback cache si offline.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match('./index.html'))
        )
    );
  } else {
    // Cache-first pour les assets statiques (CSS/JS/icônes) : rapide, peu volatil.
    // Mise à jour silencieuse en arrière-plan à chaque requête (stale-while-revalidate).
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((response) => {
            if (response && response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
  }
});
