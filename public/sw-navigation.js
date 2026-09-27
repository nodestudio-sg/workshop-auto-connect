/* Imported by the generated service worker (see vite.config.ts).
   Network-first for page navigations, with a cached offline screen. */
const PAGE_CACHE = "pages-v1";

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/~oauth") || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(PAGE_CACHE);
        cache.put(request, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        const offline = await caches.match("/offline.html", { ignoreSearch: true });
        if (offline) return offline;
        return new Response("You are offline.", {
          status: 503,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
    })(),
  );
});
