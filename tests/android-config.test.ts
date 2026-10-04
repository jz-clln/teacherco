// @vitest-environment node
import { readFileSync, existsSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { ANDROID_PACKAGE_ID, androidApkUrl, androidAssetLinks } from "@/lib/android/config";
import { GET } from "@/app/.well-known/assetlinks.json/route";
import { updateSession } from "@/lib/supabase/proxy";
import { NextRequest } from "next/server";

const native = JSON.parse(readFileSync("android-twa/twa-manifest.json", "utf8"));
const gradle = readFileSync("android-twa/app/build.gradle", "utf8");
afterEach(() => vi.unstubAllEnvs());

it("serves public JSON with no invented certificate or auth redirect when unconfigured", async () => {
  vi.stubEnv("ANDROID_SHA256_CERT_FINGERPRINTS", "");
  const proxy = await updateSession(new NextRequest("https://teacherco.vercel.app/.well-known/assetlinks.json"));
  expect(proxy.status).toBe(200);
  expect(proxy.headers.get("location")).toBeNull();
  const response = GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("application/json");
  expect(await response.json()).toEqual([]);
});
it("does not grant trust for malformed signing configuration", () => {
  for (const value of [undefined, "", "TODO", "not-a-certificate", "AA:BB"]) expect(androidAssetLinks(value)).toEqual([]);
});
it("keeps native identity, version, host, start URL, and colors aligned", () => {
  expect(native).toMatchObject({ packageId: ANDROID_PACKAGE_ID, host: "teacherco.vercel.app", startUrl: "/today", appVersionName: "0.1.0", appVersionCode: 1, themeColor: "#1A4D2E", backgroundColor: "#F5EFE6", additionalTrustedOrigins: [], fingerprints: [], fallbackType: "customtabs" });
  expect(gradle).toContain(`applicationId "${ANDROID_PACKAGE_ID}"`);
  expect(gradle).toContain("versionCode 1");
  expect(gradle).toContain('versionName "0.1.0"');
  expect(gradle).toContain("hostName: 'teacherco.vercel.app'");
  expect(gradle).toContain("launchUrl: '/today'");
  expect(readFileSync("android-twa/app/src/main/res/values/strings.xml", "utf8")).toContain("https://teacherco.vercel.app");
});
it("pins generator/build tools and requires explicit release signing", () => {
  const tools = JSON.parse(readFileSync("android-twa/package.json", "utf8"));
  expect(tools.devDependencies["@bubblewrap/cli"]).toBe("1.25.0");
  expect(gradle).toContain("androidbrowserhelper:2.6.2");
  expect(gradle).toContain("throw new GradleException('Release signing is not configured.");
  expect(gradle).toContain("signingConfig signingConfigs.release");
  expect(existsSync("android-twa/gradle/wrapper/gradle-wrapper.jar")).toBe(true);
  expect(readFileSync("android-twa/gradle/wrapper/gradle-wrapper.properties", "utf8")).toContain("distributionSha256Sum=");
});
it("requests only Internet permission and disables cleartext/backup", () => {
  const xml = readFileSync("android-twa/app/src/main/AndroidManifest.xml", "utf8");
  const permissions = [...xml.matchAll(/<uses-permission android:name="([^"]+)"/g)].map(match => match[1]);
  expect(permissions).toEqual(["android.permission.INTERNET"]);
  expect(xml).toContain('android:allowBackup="false"');
  expect(xml).toContain('android:usesCleartextTraffic="false"');
  expect(xml).not.toContain("WebViewFallbackActivity");
});
it("uses the existing icons and has launcher/adaptive resources", () => {
  for (const key of ["iconUrl", "maskableIconUrl"]) {
    const url = new URL(native[key]);
    expect(url.origin).toBe("https://teacherco.vercel.app");
    expect(existsSync(`public${url.pathname}`)).toBe(true);
  }
  for (const density of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
    expect(existsSync(`android-twa/app/src/main/res/mipmap-${density}/ic_launcher.png`)).toBe(true);
    expect(existsSync(`android-twa/app/src/main/res/mipmap-${density}/ic_maskable.png`)).toBe(true);
  }
});
it("hides empty, malformed, credential-bearing and unsafe APK URLs", () => {
  for (const value of [undefined, "", "not a url", "javascript:alert(1)", "http://example.test/app.apk", "https://user:password@example.test/app.apk"]) expect(androidApkUrl(value)).toBeNull();
  expect(androidApkUrl("https://example.test/teacherco.apk")).toBe("https://example.test/teacherco.apk");
});
