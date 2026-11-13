/* Offline cache for the app shell: after the first visit the app opens without internet. */
const VERSION = 'rs-v8';
const FILES = ["./", "index.html", "app.js", "db.js", "rules.js", "report.html", "report.css", "report.js", "manifest.webmanifest", "assets/bar_green.jpg", "assets/bar_red.jpg", "assets/compass_k.jpg", "assets/compass_n.jpg", "assets/cover_photo.jpg", "assets/icon_turn.png", "assets/logo_company.jpg", "assets/ref/r17.jpg", "assets/ref/r18.jpg", "assets/ref/r23.jpg", "assets/ref/r24.jpg", "assets/ref/r25.jpg", "assets/ref/r30.jpg", "assets/ref/r31.jpg", "assets/ref/r36.jpg", "assets/ref/r37.jpg", "assets/ref/r42.jpg", "assets/ref/r43.jpg", "assets/ref/r48.jpg", "assets/ref/r49.jpg", "assets/ref/r54.jpg", "assets/ref/r55.jpg", "assets/ref/r60.jpg", "assets/ref/r61.jpg", "assets/ref/r66.jpg", "assets/ref/r67.jpg", "assets/ref/r72.jpg", "assets/ref/r73.jpg", "assets/ref/r78.jpg", "assets/ref/r79.jpg", "fonts/Carlito-Bold.ttf", "fonts/Carlito-BoldItalic.ttf", "fonts/Carlito-Italic.ttf", "fonts/Carlito-Regular.ttf", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // map tiles etc. go straight to the network
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
