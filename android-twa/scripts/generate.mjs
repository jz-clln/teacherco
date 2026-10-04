// One-time Bubblewrap initialization from the actual production web manifest.
// Existing Android projects are never overwritten by this command.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { TwaManifest, TwaGenerator, ConsoleLog } = require("@bubblewrap/core");
const root = fileURLToPath(new URL("../", import.meta.url));
if (existsSync(path.join(root, "app"))) throw new Error("Android sources already exist. Do not regenerate over reviewed signing/security customizations.");
const url = "https://teacherco.vercel.app/manifest.webmanifest";
const response = await fetch(url);
if (!response.ok) throw new Error(`Production manifest returned ${response.status}`);
const webManifest = await response.json();
if (webManifest.start_url !== "/today") throw new Error("The production PWA start URL changed; review before initializing Android.");
const manifest = TwaManifest.fromWebManifestJson(new URL(url), webManifest);
Object.assign(manifest, {
  packageId: "app.teacherco.android", name: "TeacherCo", launcherName: "TeacherCo",
  appVersionName: "0.1.0", appVersionCode: 1, host: "teacherco.vercel.app", startUrl: "/today",
  enableNotifications: false, enableSiteSettingsShortcut: true, splashScreenFadeOutDuration: 0,
  fallbackType: "customtabs", orientation: "default", minSdkVersion: 23,
  additionalTrustedOrigins: [], features: {}, fingerprints: [], shortcuts: [],
  generatorApp: "bubblewrap-core-1.25.0", themeColorDark: manifest.themeColor,
  navigationColor: manifest.backgroundColor, navigationColorDark: manifest.themeColor,
  navigationDividerColor: manifest.themeColor, navigationDividerColorDark: manifest.themeColor,
  signingKey: { path: ".signing/teacherco-release.jks", alias: "teacherco" },
});
await mkdir(root, { recursive: true });
await writeFile(path.join(root, "source-web-manifest.json"), JSON.stringify(webManifest, null, 2) + "\n");
await manifest.saveToFile(path.join(root, "twa-manifest.json"));
await new TwaGenerator().createTwaProject(root, manifest, new ConsoleLog("TeacherCo"));
console.log("Generated TeacherCo from the production manifest using Bubblewrap 1.25.0. No signing key was created.");
