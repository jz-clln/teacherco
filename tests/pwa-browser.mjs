// Run after a production build with npm run start -- --port 3100.
import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import { mkdir } from "node:fs/promises";

const baseURL = process.env.LANDING_TEST_URL || "http://127.0.0.1:3100";
await mkdir("test-results/pwa", { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") console.log("Browser:", message.text()); });
  // A static page lets us seed old caches before the new worker registers.
  await page.goto("/offline.html");
  await page.evaluate(async () => {
    for (const name of ["others", "cross-origin", "pages-rsc"]) {
      const cache = await caches.open(name);
      await cache.put("/old-private-record", new Response("old data"));
    }
  });
  await page.goto("/");
  await page.evaluate(async () => {
    await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error("Service worker did not activate")), 15000))]);
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const manifestURL = await page.locator('link[rel="manifest"]').getAttribute("href");
  assert.equal(manifestURL, "/manifest.webmanifest");
  const manifest = await (await context.request.get(manifestURL)).json();
  assert.equal(manifest.start_url, "/today");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.id, "/today");
  for (const icon of manifest.icons) {
    assert.equal((await context.request.get(icon.src)).status(), 200);
    const size = await page.evaluate(async src => {
      const image = new Image(); image.src = src; await image.decode(); return `${image.naturalWidth}x${image.naturalHeight}`;
    }, icon.src);
    assert.equal(size, icon.sizes);
  }
  assert.equal(await page.locator('meta[name="mobile-web-app-capable"]').getAttribute("content"), "yes");
  assert.equal(await page.locator('link[rel="apple-touch-icon"]').getAttribute("href"), "/icons/apple-touch-icon.png");
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 1);
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  assert.deepEqual(installabilityErrors, []);
  console.log("Manifest, icon dimensions, Apple metadata, one active worker, and Chromium installability pass");

  // A synthetic event verifies our UI integration; it does not simulate OS installation.
  await page.evaluate(() => {
    window.testPromptCount = 0;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, { prompt: async () => { window.testPromptCount++; }, userChoice: Promise.resolve({ outcome: "dismissed", platform: "web" }) });
    window.dispatchEvent(event);
  });
  assert.equal(await page.evaluate(() => window.testPromptCount), 0);
  await page.getByRole("button", { name: "Install TeacherCo", exact: true }).click();
  await page.getByRole("link", { name: "Continue in browser" }).waitFor();
  assert.equal(await page.evaluate(() => window.testPromptCount), 1);
  assert.equal(await page.getByRole("link", { name: "Open TeacherCo" }).count(), 0);
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  assert.equal(await page.getByRole("link", { name: "Open TeacherCo" }).getAttribute("href"), "/login");

  await page.evaluate(async () => {
    await fetch("/api/settings/export", { redirect: "manual" });
    await fetch("/classes", { headers: { RSC: "1" }, redirect: "manual" });
    await fetch("/admin/invites", { redirect: "manual" });
    await fetch("/auth/confirm", { redirect: "manual" });
  });
  const cacheEntries = await page.evaluate(async () => {
    const names = await caches.keys();
    return Promise.all(names.map(async name => ({ name, urls: (await (await caches.open(name)).keys()).map(request => request.url) })));
  });
  const precache = cacheEntries.find(cache => cache.name === "teacherco-precache-v2");
  assert.ok(precache);
  assert.ok(!cacheEntries.some(cache => ["others", "cross-origin", "pages-rsc"].includes(cache.name)));
  assert.equal(precache.urls.length, 5); // Four icons and one offline document, no large artwork.
  for (const cache of cacheEntries) for (const url of cache.urls) {
    assert.ok(/^\/(?:icons\/|offline\.html|_next\/|brand\/)/.test(new URL(url).pathname), `Unexpected cache entry: ${url}`);
  }
  await context.setOffline(true);
  await page.goto("/classes");
  await page.getByRole("heading", { name: "You're offline." }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Try again" }).count(), 1);
  assert.equal(await page.locator("img").evaluate(image => image.complete && image.naturalWidth > 0), true);
  const privateAPI = await page.evaluate(async () => { try { await fetch("/api/settings/export"); return "served"; } catch { return "network-error"; } });
  assert.equal(privateAPI, "network-error");
  const credentialedAsset = await page.evaluate(async () => {
    try { await fetch("/icons/icon-192.png", { headers: { Authorization: "Bearer test-only" } }); return "served"; }
    catch { return "network-error"; }
  });
  assert.equal(credentialedAsset, "network-error", "Authorization must bypass even the icon precache");
  await page.screenshot({ path: "test-results/pwa/offline.png" });
  await context.setOffline(false);
  await page.getByRole("button", { name: "Try again" }).click();
  await page.waitForURL("**/login");
  assert.deepEqual(errors, []);
  console.log("Prompt lifecycle, network-only private requests, lightweight precache, offline fallback, and retry pass");
  await context.close();

  const ios = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" });
  const phone = await ios.newPage();
  await phone.goto("/");
  await phone.getByRole("button", { name: "Install TeacherCo", exact: true }).click();
  const dialog = phone.getByRole("dialog");
  await dialog.waitFor();
  assert.ok(await dialog.getByText("Add to Home Screen", { exact: true }).isVisible());
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await phone.screenshot({ path: "test-results/pwa/ios-instructions.png" });
  await phone.keyboard.press("Escape");
  assert.equal(await dialog.isVisible(), false);
  assert.equal(await phone.getByRole("button", { name: "Install TeacherCo", exact: true }).evaluate(el => el === document.activeElement), true);
  await ios.close();

  const standalone = await browser.newContext({ baseURL });
  await standalone.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = query => query === "(display-mode: standalone)" ? { matches: true, media: query, addEventListener() {}, removeEventListener() {} } : original(query);
  });
  const installedPage = await standalone.newPage();
  await installedPage.goto("/");
  assert.equal(await installedPage.getByRole("link", { name: "Open TeacherCo" }).getAttribute("href"), "/login");
  await standalone.close();

  const noJS = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const plain = await noJS.newPage();
  await plain.goto("/");
  assert.ok(await plain.locator('.landing-hero a[href="/request-access"]').isVisible());
  assert.ok(await plain.getByRole("link", { name: "Continue in browser" }).isVisible());
  await noJS.close();
  console.log("iOS dialog, focus return, standalone routing, and no-JavaScript fallback pass");
} finally {
  await browser.close();
}
