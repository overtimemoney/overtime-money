/* Overtime Money Budget service worker — offline-first PWA.
 * Bump CACHE when shipping changes so clients pick up the new version. */
var CACHE = 'om-budget-20261010175025';
var FILES = [
  './',
  './index.html',
  './app-wJXsTa5CYE0.html',
  './styles.css',
  './engine.js',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './logo.png',
  './fonts/nunito-latin.woff2',
  './fonts/newsreader-latin.woff2',
  './fonts/fredoka-latin.woff2'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* cache:'reload' bypasses the HTTP cache so an install never pins stale bytes */
      return c.addAll(FILES.map(function (u) { return new Request(u, { cache: 'reload' }); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html');
      });
    })
  );
});
