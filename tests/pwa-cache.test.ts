// @vitest-environment node
import { expect, it } from "vitest";
import { isLegacyTeacherCoCache, isPublicAsset, mayStorePublicResponse } from "@/lib/pwa/cache-policy";
import manifest from "@/app/manifest";

const origin = "https://teacherco.vercel.app";
it.each([
  "/today", "/classes", "/reports/private.pdf", "/api/learners", "/auth/callback", "/admin/invites",
  "/_next/data/build/classes.json", "/private/image.png", "/brand/today-visual.png?token=secret",
  "/_next/image?url=https%3A%2F%2Fprivate.supabase.co%2Fsecret.png&w=640&q=75",
  "/_next/image?url=%2Fapi%2Fprivate-image&w=640&q=75", "/_next/image?url=%2Fbrand%2Ftoday-visual.png&token=secret",
  "https://project.supabase.co/rest/v1/learners", "https://project.supabase.co/storage/v1/object/sign/private/file.png?token=secret",
])("does not runtime-cache %s", url => {
  expect(isPublicAsset(new Request(new URL(url, origin)), origin)).toBe(false);
});
it.each([
  "/icons/icon-192.png", "/brand/today-visual.png", "/_next/static/chunks/app/page-a1b2.js",
  "/_next/static/css/style-123.css", "/_next/static/media/font.woff2",
  "/_next/image?url=%2Fbrand%2Fteacherco-mascot.png&w=96&q=75",
  "/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftoday-visual.abcd1234.png&w=640&q=75",
])("allows the public asset %s", url => {
  expect(isPublicAsset(new Request(new URL(url, origin)), origin)).toBe(true);
});
it.each(["Authorization", "RSC", "Next-Action"])("rejects public-looking requests carrying %s", header => {
  expect(isPublicAsset(new Request(`${origin}/icons/icon-192.png`, { headers: { [header]: "value" } }), origin)).toBe(false);
});
it("never caches mutations or private/error/HTML responses", () => {
  expect(isPublicAsset(new Request(`${origin}/icons/icon-192.png`, { method: "POST" }), origin)).toBe(false);
  for (const response of [new Response("login", { headers: { "Content-Type": "text/html" } }), new Response("image", { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } }), new Response("error", { status: 403 })]) {
    expect(mayStorePublicResponse(response)).toBe(false);
  }
  expect(mayStorePublicResponse(new Response("image", { headers: { "Content-Type": "image/png" } }))).toBe(true);
});
it("cleans up former broad caches without deleting current caches or unrelated storage", () => {
  for (const name of ["cross-origin", "apis", "pages-rsc", "others", "serwist-precache-v2-http://localhost/"]) expect(isLegacyTeacherCoCache(name)).toBe(true);
  for (const name of ["teacherco-precache-v2", "teacherco-public-assets-v2", "unrelated-cache"]) expect(isLegacyTeacherCoCache(name)).toBe(false);
});
it("publishes one standalone manifest with separate any and maskable icons", () => {
  expect(manifest()).toMatchObject({ id: "/today", scope: "/", start_url: "/today", display: "standalone", background_color: "#F5EFE6", theme_color: "#1A4D2E" });
  expect(manifest().icons).toEqual(expect.arrayContaining([expect.objectContaining({ sizes: "192x192", purpose: "any" }), expect.objectContaining({ sizes: "512x512", purpose: "maskable" })]));
});
