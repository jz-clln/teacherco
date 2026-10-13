# Windows installation

Windows visitors to the public landing page see **Install for Windows**. When
Edge or Chrome supplies `beforeinstallprompt`, the button opens that prompt on
click. If no prompt is available (including after dismissal or in unsupported
browsers), the button opens manual Edge/Chrome instructions and a browser link.
Installed standalone windows show **Open TeacherCo**. The Android APK link appears
only on Android when its existing HTTPS download URL is configured.

This uses the existing PWA manifest, identity, icons, service worker, and offline
workspace. No EXE, signing certificate, new hosting service, or database migration
is needed. Windows users can launch the installed app from Start and pin it to
the taskbar. First sign-in and preparation require internet; offline work and
access expiry follow the same rules as the website. Browser install controls can
be unavailable on managed devices; the browser link remains available.

Validation: `tests/pwa-install.test.tsx`, `tests/android-download.test.tsx`, and
`node tests/windows-install-browser.mjs` against a production server. The tests
cover the native prompt event, dismissal fallback, Windows visibility, installed
state, iOS regression, Android-only APKs, dialog focus and responsive layout.
They do not install an application into the tester's Windows account.

Official installation guidance used for the manual instructions:
- https://support.microsoft.com/en-us/edge/install-manage-or-uninstall-apps-in-microsoft-edge
- https://support.google.com/chrome/answer/9658361
