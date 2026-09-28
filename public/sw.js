/* Service worker for the installed app (registered from src/lib/pwa.ts).
 *
 * Hand-written rather than generated: the build's PWA plugin could not find
 * the client files and failed the build. This one needs no build step.
 *
 * - Pages: network first, falling back to the last copy, then the offline
 *   screen, so a customer on bad workshop wifi still sees something useful.
 * - Hashed build assets (/assets/*): cache first; their names change on
 *   every release, so they never go stale.
 * - Logos and photos: served from cache, refreshed in the background.
 * - Everything else — the database, sign-in, server functions — always goes
 *   to the network and is never cached.
 */
const VERSION = "v2";
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const IMAGES = `images-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![PAGES, ASSETS, IMAGES].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Only this site; never Supabase or any other origin.
  if (url.origin !== self.location.origin) return;
  // Never cache sign-in callbacks, server functions or APIs.
  if (
    url.pathname.startsWith("/~oauth") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_serverFn")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }
  if (/\.(png|jpe?g|webp|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, IMAGES));
  }
});

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("You are offline.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((fresh) => {
      if (fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    })
    .catch(() => cached ?? Response.error());
  return cached ?? refresh;
}
