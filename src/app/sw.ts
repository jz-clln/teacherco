import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from "serwist";
import { isLegacyTeacherCoCache, isPublicAsset, mayStorePublicResponse } from "@/lib/pwa/cache-policy";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cacheName: "teacherco-precache-v2" },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Every page, RSC response, API and cross-origin request is network-only.
  // Only explicitly public assets may enter the runtime cache.
  runtimeCaching: [
    {
      matcher: ({ request }) => isPublicAsset(request, self.location.origin),
      handler: new CacheFirst({
        cacheName: "teacherco-public-assets-v2",
        plugins: [
          { cacheWillUpdate: async ({ response }) => mayStorePublicResponse(response) ? response : null },
          new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        ],
      }),
    },
    { matcher: () => true, handler: new NetworkOnly() },
  ],
  fallbacks: {
    entries: [{ url: "/offline.html", matcher: ({ request }) => request.mode === "navigate" }],
  },
});

// Authorization-bearing requests bypass even the public precache route.
self.addEventListener("fetch", event => {
  if (event.request.headers.has("authorization")) {
    event.respondWith(fetch(event.request));
    event.stopImmediatePropagation();
  }
});

// Remove caches created by the former defaultCache rules on upgrade. This never
// touches Dexie/IndexedDB or queued offline work.
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(names => Promise.all(
    names.filter(isLegacyTeacherCoCache).map(name => caches.delete(name)),
  )));
});

serwist.addEventListeners();
