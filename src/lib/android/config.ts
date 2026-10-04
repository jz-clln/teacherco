export const ANDROID_PACKAGE_ID = "app.teacherco.android";

// Certificate fingerprints are public identifiers. Private signing keys and
// passwords never belong in this configuration or in the Android download URL.
export function androidAssetLinks(value: string | undefined) {
  const fingerprints = [...new Set((value ?? "").split(",").map(item => item.trim().toUpperCase()).filter(Boolean))];
  if (!fingerprints.length || fingerprints.some(item => !/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(item))) return [];
  return [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: ANDROID_PACKAGE_ID, sha256_cert_fingerprints: fingerprints },
  }];
}

export function androidApkUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
