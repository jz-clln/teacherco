# TeacherCo Android app — Batch 3

## Status of this implementation

The Android project is generated and configured, but **no APK or AAB was produced in this workspace**. The installed Java is an 8u401 runtime without `javac`; JDK 17, Android SDK Platform 36, Build Tools 35.0.0, and adb are unavailable. `android:doctor`, `android:build`, and `android:bundle` report these prerequisites rather than claiming a build succeeded.

**Release signing fingerprint still needs to be supplied.** No permanent release keystore was created. No debug keystore was generated because Gradle could not run. Production TWA verification is not ready until the actual certificate is configured and the web change is deployed.

## Architecture

TeacherCo Android → Trusted Web Activity (Android Browser Helper) → `https://teacherco.vercel.app/today` → existing Next.js and Supabase.

The hosted web product remains authoritative for authentication, email verification, invite access, onboarding, roles, suspension, classroom data, and server calculations. The wrapper has no native login, auth database, Supabase credentials, analytics SDK, advertising SDK, or native classroom cache. It does not statically export Next.js.

The TWA uses the supporting browser's web session and normal browser permission/navigation behavior. Verification removes browser chrome only for the declared TeacherCo origin. The fallback is Custom Tabs, not a WebView. No additional origins or wildcard domains are trusted.

## Native identity and pinned tools

| Setting | Value |
| --- | --- |
| Permanent application ID | `app.teacherco.android` |
| App / launcher name | TeacherCo |
| versionName | `0.1.0` |
| versionCode | `1` |
| Host | `teacherco.vercel.app` |
| Launch URL | `https://teacherco.vercel.app/today` |
| Minimum Android SDK | 23 |
| Compile / target SDK | 36 |
| Android Build Tools | 35.0.0 |
| Bubblewrap CLI / core | 1.25.0, pinned in isolated package and lockfile |
| Android Browser Helper | 2.6.2, pinned by the Bubblewrap template |
| Android Gradle Plugin | 8.10.1 |
| Gradle wrapper | 8.11.1, distribution SHA-256 pinned |
| Build Java | JDK 17 recommended |

The initial project was generated with Bubblewrap's `TwaManifest` / `TwaGenerator` APIs from the actual public production manifest. This avoids interactive CLI signing-key creation. The source snapshot is `android-twa/source-web-manifest.json`; `twa-manifest.json` holds native configuration. The generator script refuses to overwrite existing Android sources.

The generated AGP version was raised from 8.9.1 to 8.10.1 to match SDK 36 support, JCenter was replaced with Maven Central, and release signing/security settings were added. These reviewed source customizations must not be overwritten by a blind `bubblewrap update`. Android builds use committed Gradle sources and the checked-in wrapper; no global Bubblewrap installation is required.

## Source inventory

Created:

- `android-twa/`: Gradle project, wrapper JAR/scripts, `app/src/main/AndroidManifest.xml`, Bubblewrap Java launcher/application/delegation classes, existing-brand launcher/adaptive/splash resources, manifest snapshots, pinned `package.json`/`package-lock.json`, `keystore.properties.example`, and helper scripts.
- `src/app/.well-known/assetlinks.json/route.ts`: public Digital Asset Links endpoint.
- `src/lib/android/config.ts`: package identity, fingerprint configuration validation, and safe APK URL validation.
- `src/components/pwa/android-apk-link.tsx`: optional tertiary APK link.
- `tests/android-config.test.ts`, `tests/android-download.test.tsx`, `tests/android-web-smoke.mjs`.
- `docs/ANDROID_APP.md`.

Modified: `.gitignore`, `.env.example`, `package.json`, `tsconfig.json`, `src/lib/supabase/proxy.ts`, and `src/components/landing/landing-page.tsx`.

The existing PWA worker, cache rules, manifest, install hook, iOS dialog, and auth/access helpers are unchanged. The proxy exemption applies only to the exact `/.well-known/assetlinks.json` path.

## Prerequisites and installation

1. Install a full JDK 17 and set `JAVA_HOME` to its root. Add its `bin` directory to PATH. `java -version`, `javac -version`, and `keytool -help` must work.
2. Install Android Studio or Android command-line tools. In SDK Manager, install Android SDK Platform 36, Android SDK Build Tools 35.0.0, and Android SDK Platform-Tools. Set `ANDROID_HOME` to the SDK root. Review and accept the SDK licenses.
3. Command-line equivalent once `sdkmanager` is on PATH:

   ```powershell
   sdkmanager "platforms;android-36" "build-tools;35.0.0" "platform-tools"
   sdkmanager --licenses
   ```

4. From the repository root:

   ```powershell
   npm ci --prefix android-twa
   npm run android:doctor
   ```

An ignored `android-twa/local.properties` with `sdk.dir` is conventional for Android Studio, but the repository's helper commands use `ANDROID_HOME` / `ANDROID_SDK_ROOT` or the standard SDK location. Do not put credentials in Gradle properties or package scripts.

## Development APK and AAB

```powershell
npm run android:build
npm run android:bundle:debug
```

Expected outputs **after a successful build**:

- Debug APK: `android-twa/app/build/outputs/apk/debug/app-debug.apk`
- Debug AAB: `android-twa/app/build/outputs/bundle/debug/app-debug.aab`

The standard Android debug signing configuration generates/uses the local development key at `$HOME/.android/debug.keystore` when Gradle first builds. Its conventional alias is `androiddebugkey`; the conventional password is `android`. This is development signing, not your permanent release identity. Do not distribute debug builds as production releases.

Inspect its real certificate after generation:

```powershell
keytool -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey
```

For a verified development TWA, the deployed origin must explicitly trust that real debug fingerprint. **Debug fingerprints are not published automatically.** Different machines may generate different debug certificates. Remove any temporary debug trust after testing, and do not bypass verification or hide browser chrome with debugging flags.

## Permanent release key — manual creation only

If you already have a TeacherCo production keystore, reuse it. Do not run the creation command against an existing key.

Otherwise, from the repository root, create the ignored key directory and run this command yourself:

```powershell
New-Item -ItemType Directory -Force android-twa/.signing
keytool -genkeypair -v -keystore "android-twa/.signing/teacherco-release.jks" -storetype JKS -alias teacherco -keyalg RSA -keysize 3072 -sigalg SHA256withRSA -validity 10000
```

Keytool prompts interactively for passwords and certificate identity. **Keep an encrypted backup of the keystore and securely retain its passwords.** Git ignores this directory, and a checkout or a build machine is not a backup. Losing the signing identity can prevent updates to directly distributed installations. You may instead keep the key outside the repository and point `storeFile` to it.

Copy the safe template and fill it locally:

```powershell
Copy-Item android-twa/keystore.properties.example android-twa/keystore.properties
```

Fields: `storeFile`, `storePassword`, `keyAlias`, `keyPassword`. `storeFile` is relative to `android-twa/` or absolute; use forward slashes for Windows paths in Java properties files. The default is `.signing/teacherco-release.jks`. Both the key and `keystore.properties` are ignored.

Alternatively supply `ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` in the build environment. Never commit these secrets or print them in build logs. Release Gradle tasks fail if configuration or the key file is missing; they do not silently fall back to debug signing or create a permanent key.

## Release APK and Play-ready bundle workflow

```powershell
npm run android:release
npm run android:bundle
```

Expected outputs **after a successful signed build**:

- Release APK: `android-twa/app/build/outputs/apk/release/app-release.apk`
- Release AAB: `android-twa/app/build/outputs/bundle/release/app-release.aab`

The normal `npm run build` still builds only Next.js. APKs, AABs, Gradle caches, build directories, keys, and local signing configuration are ignored by Git. The AAB is not directly installable with adb; it is the package for later Play distribution.

Inspect the actual release certificate:

```powershell
keytool -list -v -keystore "android-twa/.signing/teacherco-release.jks" -alias teacherco
```

After building, verify the APK certificate too (Windows SDK path example):

```powershell
& "$env:ANDROID_HOME\build-tools\35.0.0\apksigner.bat" verify --print-certs "android-twa/app/build/outputs/apk/release/app-release.apk"
```

## Digital Asset Links

Public URL: **https://teacherco.vercel.app/.well-known/assetlinks.json**

The new web route returns HTTP 200 and JSON without auth, invitation, or onboarding redirects. It reads the server environment variable `ANDROID_SHA256_CERT_FINGERPRINTS`: one or more real, colon-separated SHA-256 fingerprints, separated by commas. It emits the permanent package ID and relation `delegate_permission/common.handle_all_urls`.

When missing or malformed, the route returns `[]`, granting no app trust. It never substitutes a made-up fingerprint. **Release signing fingerprint still needs to be supplied.** To activate verification:

1. Inspect the exact certificate used to sign the APK installed on the device.
2. Set its SHA-256 value in Vercel's `ANDROID_SHA256_CERT_FINGERPRINTS` environment variable.
3. Deploy this web change and the environment configuration.
4. Open the public URL and verify status 200, JSON content type, the package ID, and the real certificate value.
5. Launch the APK with a compatible browser. Verify that browser chrome is absent for TeacherCo after successful origin verification.

The native application already declares the reverse association with the single TeacherCo HTTPS origin in its `assetStatements` resource. No server secret or signing password belongs in assetlinks; fingerprints are public certificate identifiers.

## Landing download and beta distribution

There was no existing repository release workflow or published APK URL supplied. No release was published and no URL was invented. Host a signed beta APK using GitHub Releases for `jz-clln/teacherco` or another controlled HTTPS artifact host, then set:

```text
NEXT_PUBLIC_ANDROID_APK_URL=<actual HTTPS URL to the uploaded APK>
```

Redeploy the web app. A small **Download Android APK (Beta)** link appears under the hero's existing device/install controls. It is separate from PWA installation and does not replace Request Early Access. With no valid URL configured, the link is absent. There is no `/download` route.

Do not commit binary packages. APK distribution does not grant a TeacherCo invite. Android may ask permission to install from the browser/file manager used for the download; follow that app-specific system flow. Do not disable Play Protect or Android security globally.

## Install and test on a phone

After a debug build succeeds, connect an Android device with USB debugging enabled and run:

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" devices
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r "android-twa/app/build/outputs/apk/debug/app-debug.apk"
& "$env:ANDROID_HOME\platform-tools\adb.exe" shell am start -n app.teacherco.android/.LauncherActivity
```

Or transfer the generated APK to the phone and open it in its file manager. Changing from a debug-signed build to a differently signed release usually requires uninstalling the debug build first; preserve any needed local data before uninstalling.

Device acceptance remains **untested**: there was no Android SDK/adb/emulator available in this workspace. Check:

- Icon, brief splash, launch, and successful TWA verification without browser chrome.
- Logged-out → login; unverified → verify-email; pending → invite; suspended → suspended; active → onboarding or Today.
- Login/session reuse, request access, invite redemption, onboarding, Today, Classes, Ask, Check, Reports, Settings, logout.
- Existing Check image picker, supported camera capture, image upload, and return to TeacherCo. These remain browser flows.
- Dictation availability in the chosen TWA provider; it remains browser-dependent. No native speech implementation or startup permission prompt was added.
- Android Back through web history, exiting after history is exhausted, and external websites opening with normal browser/custom-tab treatment.
- Offline navigation uses the existing safe PWA fallback. The APK does not add full offline classroom support.

The wrapper declares only `android.permission.INTERNET`. It adds no camera, microphone, location, contacts, storage, SMS, or notification permission. Notifications are disabled. Cleartext traffic and app backup are disabled. The final merged manifest still needs inspection when Android compilation is available.

## Versions, web updates, and future Play release

`versionName` is the human-facing native version; `versionCode` is the monotonically increasing Android release integer. Change both in `android-twa/app/build.gradle` and keep `twa-manifest.json` aligned when releasing a new wrapper. Ordinary TeacherCo web deployments do not change these values or require a new APK. Native changes to icons, host, permissions, launch settings, or wrapper dependencies require a new release.

Google Play publishing is not performed here. Before a future Play upload, review current policy/target-SDK requirements, signing choices, and store declarations, then build the release AAB. If Play App Signing uses a different app-signing certificate from your local APK certificate, add the **Play app-signing** SHA-256 to assetlinks as well. The upload-key fingerprint alone does not identify the APK installed from Play. Keep the direct-distribution certificate while those APKs remain supported.

If moving to a custom domain later, update the native host, launch configuration, web manifest URLs, and native asset statement; serve assetlinks on the new origin and retest verification. Supabase Auth URLs may need a separate update. No domain migration is included in this batch.

## Verification troubleshooting

| Symptom | Check |
| --- | --- |
| assetlinks 404 | Deploy the new App Router endpoint to the actual origin. |
| assetlinks redirects / returns HTML | Verify the exact path's public proxy exemption and production routing. |
| Empty array | Supply the real certificate fingerprint; check colon format and comma separation. |
| Invalid JSON | Inspect the endpoint directly; do not serve an error page or hand-edited invalid JSON. |
| Package mismatch | APK application ID and JSON target must both be `app.teacherco.android`. |
| Fingerprint mismatch | Inspect the installed APK with apksigner, not a different keystore. |
| Debug vs release mismatch | These use different certificates; trust only the intended one. |
| Browser chrome persists | Check host, fingerprint, provider support, network, and verification caching. Never bypass verification. |
| Stale deployment | Confirm deployed environment values and wait for the endpoint's five-minute public cache to expire. |
| Play build fails verification | Use Play Console's app-signing certificate, not just its upload certificate. |
| Java / Gradle cannot start | Install JDK 17, set JAVA_HOME, and rerun android:doctor. |
| SDK missing | Install Platform 36 / Build Tools 35.0.0 and set ANDROID_HOME. |
| Release signing missing | Fill the ignored properties file or build environment; do not generate a replacement key casually. |

## Validation and known limits

- Web TypeScript and focused Android/PWA/access-routing tests pass (59 tests).
- New/changed JavaScript and TypeScript pass ESLint.
- Production web build passes and includes the dynamic public assetlinks route. The local production endpoint returns 200 JSON without an auth redirect, including with unrelated cookies present.
- PWA browser regressions pass: manifest, icons, worker registration, Chromium installability, iOS instructions, simulated standalone mode, no-JavaScript fallback, private-cache restrictions, offline fallback, and reconnect retry.
- Landing-page browser regressions pass at 320, 360, 390, 768, 1024, and 1440 pixels, with no horizontal overflow and unchanged authentication navigation.
- Android doctor/build/bundle were attempted and blocked by the missing prerequisites above. Native Gradle compilation, APK signing, AAB signing, installed authentication, camera/file picking, microphone, Back behavior, and device TWA verification are not claimed as tested.
- Existing unrelated failures remain: four OpenAI report-mock tests, one score-entry focus test, a Playwright suite discovered by Vitest, the dictation state-in-effect lint error at `src/features/exams/components/use-dictation.ts:37`, and report-test unused-argument warnings.
- No Supabase migration, new authentication system, production key, production deployment, release upload, or Google Play publication was performed.

Re-run the web browser checks against a local production server on port 3100:

```powershell
node tests/android-web-smoke.mjs
node tests/pwa-browser.mjs
node tests/landing-browser.mjs
```

## Primary references

- [Chrome: TWA quick start and certificate verification](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start)
- [Bubblewrap CLI documentation](https://github.com/GoogleChromeLabs/bubblewrap/blob/main/packages/cli/README.md)
- [Android: Digital Asset Links and Play signing certificates](https://developer.android.com/training/app-links/configure-assetlinks)
- [AGP 8.10 compatibility: SDK 36, Gradle 8.11.1, JDK 17](https://developer.android.com/build/releases/agp-8-10-0-release-notes)

Suggested commit: `feat: add TeacherCo Android TWA app`
