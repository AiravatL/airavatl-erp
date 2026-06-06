// Minimal service worker for AiravatL ERP.
// Its primary job is to make the app installable as a PWA; it keeps a tiny
// navigation cache so a launched (standalone) app still opens if the network
// briefly drops. It is intentionally network-first — the ERP is always-online
// and must never serve stale data.
const CACHE = "airavatl-erp-v2";
const FALLBACK = "/dashboard";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Network-first for page navigations, falling back to the last cached shell
  // if offline (so a home-screen launch doesn't dead-end on a blank page).
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE);
          cache.put(FALLBACK, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(request);
          return cached || (await caches.match(FALLBACK)) || Response.error();
        }
      })(),
    );
  }
});
