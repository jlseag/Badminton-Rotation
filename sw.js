/* Offline cache — the courts usually have worse signal than the car park. */
const V = 'mabyo-v55';

// Note: './index.html' is deliberately NOT here. Cloudflare 308-redirects it
// to './', and a redirected response used for a navigation is a hard error in
// Safari — which is what broke the installed app on iOS. Cache the canonical
// path only.
const ASSETS = ['./', './manifest.json', './icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(V)
      .then(c => Promise.all(ASSETS.map(u =>
        fetch(u, { cache: 'reload' })
          .then(r => (r.ok && !r.redirected) ? c.put(u, r) : null)
          .catch(() => null)
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

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  let url;
  try { url = new URL(e.request.url); } catch (_) { return; }

  // Never touch another origin. Supabase calls must reach the network every
  // single time: a cached entitlement is a cached paywall, and an app that
  // believes a stale "active" is an app that cannot be revoked.
  if (url.origin !== self.location.origin) return;

  const navigation = e.request.mode === 'navigate';
  // Navigations always ask for the canonical path, so the response can never
  // be a redirect. Page requests skip the HTTP cache so "network first"
  // really means the network.
  const hit = navigation ? fetch('./', { cache: 'reload' }) : fetch(e.request);

  e.respondWith(
    hit.then(res => {
      if (res.ok && !res.redirected) {
        const copy = res.clone();
        caches.open(V)
          .then(c => c.put(navigation ? './' : e.request, copy))
          .catch(() => {});
      }
      return res;
    }).catch(() =>
      caches.match(navigation ? './' : e.request)
        .then(r => r || caches.match('./'))
    )
  );
});
