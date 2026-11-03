/* Offline cache — the courts usually have worse signal than the car park. */
const V = 'badminton-v18';
const ASSETS = ['./', './index.html', './manifest.json', './icon.png'];

// GitHub Pages serves these with max-age=600, so a plain fetch here can hand back
// a stale copy without touching the network. cache:'reload' forces a real fetch.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(V)
      .then(c => Promise.all(ASSETS.map(u =>
        fetch(u, { cache: 'reload' }).then(r => (r.ok ? c.put(u, r) : null)).catch(() => null)
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first so an update lands as soon as there is signal, cache when there isn't.
// Page navigations skip the HTTP cache so "network first" really means the network.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const navigation = e.request.mode === 'navigate';
  const hit = navigation ? fetch(e.request.url, { cache: 'reload' }) : fetch(e.request);
  e.respondWith(
    hit.then(res => {
      const copy = res.clone();
      caches.open(V).then(c => c.put(navigation ? './index.html' : e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
