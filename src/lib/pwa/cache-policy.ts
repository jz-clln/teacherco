const publicFiles = new Set([
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png", "/icons/apple-touch-icon.png",
  ...["teacherco-mascot", "today-visual", "upload-visual", "class-visual", "ask-visual", "check-visual", "cta"].map(name => `/brand/${name}.png`),
]);

function publicImage(path: string): boolean {
  return publicFiles.has(path) || /^\/_next\/static\/media\/(?:today-visual|upload-visual|class-visual|ask-visual|check-visual|cta)\.[a-zA-Z0-9_-]+\.png$/.test(path);
}

// Default deny: neither a file extension nor same-origin alone makes data public.
export function isPublicAsset(request: Request, origin: string): boolean {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== origin || request.headers.has("authorization") ||
    request.headers.has("RSC") || request.headers.has("Next-Action") || request.mode === "navigate") return false;
  if (url.pathname === "/_next/image") {
    if ([...url.searchParams.keys()].some(key => !["url", "w", "q"].includes(key))) return false;
    const source = url.searchParams.get("url") ?? "";
    return source.startsWith("/") && publicImage(source);
  }
  if (url.search) return false;
  return publicFiles.has(url.pathname) ||
    /^\/_next\/static\/.+\.(?:js|css|woff2?|ttf|otf)$/.test(url.pathname);
}

export function mayStorePublicResponse(response: Response): boolean {
  return response.status === 200 && !response.redirected &&
    !/private|no-store/i.test(response.headers.get("cache-control") ?? "") &&
    /^(?:image\/|font\/|text\/css|(?:application|text)\/javascript|application\/(?:x-font|font|octet-stream))/.test(response.headers.get("content-type") ?? "");
}

const legacyCaches = new Set([
  "google-fonts-webfonts", "google-fonts-stylesheets", "static-font-assets", "static-image-assets",
  "next-static-js-assets", "next-image", "static-audio-assets", "static-video-assets", "static-js-assets",
  "static-style-assets", "next-data", "static-data-assets", "apis", "pages-rsc-prefetch", "pages-rsc", "pages", "others", "cross-origin",
]);
export function isLegacyTeacherCoCache(name: string): boolean {
  return legacyCaches.has(name) || /^(?:serwist|workbox)-precache-/.test(name);
}
