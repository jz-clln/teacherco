import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const windows = process.platform === "win32";
const command = process.argv[2] ?? "doctor";
const tasks = { build: "assembleDebug", release: "assembleRelease", bundle: "bundleRelease", "bundle-debug": "bundleDebug" };
if (command !== "doctor" && !tasks[command]) throw new Error("Use doctor, build, release, bundle, or bundle-debug.");
const errors = [];
function check(ok, label) { console.log(`${ok ? "OK" : "MISSING"}: ${label}`); if (!ok) errors.push(label); }
function javaTool(name) { return process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", name + (windows ? ".exe" : "")) : name; }
const java = spawnSync(javaTool("java"), ["-version"], { encoding: "utf8", windowsHide: true });
const version = `${java.stdout ?? ""}${java.stderr ?? ""}`;
const match = version.match(/version "(\d+)(?:\.(\d+))?/);
const major = match ? Number(match[1] === "1" ? match[2] : match[1]) : 0;
check(java.status === 0 && major >= 17 && major <= 23, `JDK 17–23 (JDK 17 recommended; detected ${major || "none"})`);
const javac = spawnSync(javaTool("javac"), ["-version"], { encoding: "utf8", windowsHide: true });
check(javac.status === 0, "javac compiler (a JRE alone cannot build Android)");
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
  (windows ? path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk") : path.join(os.homedir(), "Android", "Sdk"));
check(existsSync(path.join(sdk, "platforms", "android-36", "android.jar")), "Android SDK Platform 36; set ANDROID_HOME");
check(existsSync(path.join(sdk, "build-tools", "35.0.0", windows ? "aapt2.exe" : "aapt2")), "Android SDK Build Tools 35.0.0");
for (const file of ["gradlew", "gradlew.bat", "gradle/wrapper/gradle-wrapper.jar", "twa-manifest.json", "app/src/main/AndroidManifest.xml"]) {
  check(existsSync(path.join(root, file)), file);
}
const tooling = path.join(root, "node_modules/@bubblewrap/cli/package.json");
check(existsSync(tooling) && JSON.parse(readFileSync(tooling, "utf8")).version === "1.25.0", "Pinned Bubblewrap 1.25.0 (npm ci --prefix android-twa)");
console.log(existsSync(path.join(sdk, "platform-tools", windows ? "adb.exe" : "adb")) ? "OK: adb available for device installation" : "NOTE: adb not found; install Android platform-tools for device testing");

if (command === "doctor") {
  console.log(existsSync(path.join(root, "keystore.properties")) || process.env.ANDROID_KEYSTORE_FILE
    ? "NOTE: release signing configuration exists; Gradle validates it before any release build"
    : "NOTE: no release signing configuration; no permanent key is generated automatically");
  try {
    const response = await fetch("https://teacherco.vercel.app/manifest.webmanifest", { signal: AbortSignal.timeout(10000) });
    const manifest = await response.json();
    check(response.ok && manifest.start_url === "/today", "Production web manifest at /today");
  } catch { console.log("NOTE: production manifest could not be checked from this environment"); }
  process.exitCode = errors.length ? 1 : 0;
} else if (errors.length) {
  console.error("Android build blocked by the prerequisites above. No APK or AAB was generated.");
  process.exitCode = 1;
} else {
  const args = ["--no-daemon", tasks[command]];
  const result = windows
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/c", "gradlew.bat", ...args], { cwd: root, stdio: "inherit", windowsHide: true, env: { ...process.env, ANDROID_HOME: sdk } })
    : spawnSync(path.join(root, "gradlew"), args, { cwd: root, stdio: "inherit", env: { ...process.env, ANDROID_HOME: sdk } });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
  if (process.exitCode === 0) {
    const outputs = { build: "apk/debug/app-debug.apk", release: "apk/release/app-release.apk", bundle: "bundle/release/app-release.aab", "bundle-debug": "bundle/debug/app-debug.aab" };
    const artifact = path.join(root, "app/build/outputs", outputs[command]);
    if (!existsSync(artifact) || statSync(artifact).size === 0) throw new Error("Gradle returned success but the expected artifact is missing.");
    console.log(`Artifact: ${artifact}`);
  }
}
