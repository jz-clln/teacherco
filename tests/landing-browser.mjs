// Run against a local production server: npm run start -- --port 3100
// Then: node tests/landing-browser.mjs
import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import { mkdir } from "node:fs/promises";

const baseURL = process.env.LANDING_TEST_URL || "http://127.0.0.1:3100";
await mkdir("test-results/landing", { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const width of [1440, 1024, 768, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto("/", { waitUntil: "networkidle" });
    assert.equal(response.status(), 200);
    assert.equal(new URL(page.url()).pathname, "/");
    assert.equal(await page.title(), "TeacherCo — Your Classroom Companion");
    assert.equal(await page.locator("h1").count(), 1);
    assert.ok(await page.locator('.landing-hero a[href="/request-access"]').isVisible());
    assert.ok(await page.locator('.landing-hero a[href="/login"]').isVisible());
    for (const img of await page.locator("main img").all()) {
      await img.scrollIntoViewIfNeeded();
      await img.evaluate(image => image.decode());
      assert.ok(await img.evaluate(image => image.naturalWidth > 0));
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Horizontal overflow at ${width}px`);
    const faq = page.locator("details").first();
    await faq.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await faq.getAttribute("open"), "");
    await page.keyboard.press("Enter");
    if (width < 768) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      assert.ok(await page.getByRole("navigation", { name: "Mobile navigation" }).isVisible());
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("button", { name: "Open navigation" }).getAttribute("aria-expanded"), "false");
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/landing/${width}-hero.png` });
    await page.screenshot({ path: `test-results/landing/${width}.png`, fullPage: true });
    console.log(`${width}px: images, layout, navigation, FAQ passed`);
  }
  await page.locator('.landing-hero a[href="/login"]').click();
  await page.waitForURL("**/login");
  await page.goto("/");
  await page.locator('.landing-hero a[href="/request-access"]').click();
  await page.waitForURL("**/login");
  for (const route of ["/invite", "/request-access", "/onboarding", "/today", "/classes", "/check", "/reports", "/ask", "/settings", "/admin/invites"]) {
    const response = await context.request.get(route, { maxRedirects: 0 });
    assert.equal(response.status(), 307, route);
    assert.equal(new URL(response.headers().location, baseURL).pathname, "/login", route);
  }
  for (const route of ["/login", "/signup", "/legal/privacy"]) {
    assert.equal((await context.request.get(route)).status(), 200, route);
  }
  assert.deepEqual(errors, []);
  console.log("CTA navigation, protected-route redirects, public auth/legal routes, and browser errors passed");
} finally {
  await browser.close();
}
