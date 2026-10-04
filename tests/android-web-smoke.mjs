import { strict as assert } from "node:assert";
const baseURL = process.env.LANDING_TEST_URL || "http://127.0.0.1:3100";
for (const headers of [{}, { Cookie: "unrelated_cookie=test" }]) {
  const response = await fetch(`${baseURL}/.well-known/assetlinks.json`, { headers, redirect: "manual" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.ok(response.headers.get("content-type").includes("application/json"));
  const links = await response.json();
  assert.ok(Array.isArray(links));
  for (const link of links) {
    assert.equal(link.target.namespace, "android_app");
    assert.equal(link.target.package_name, "app.teacherco.android");
    assert.deepEqual(link.relation, ["delegate_permission/common.handle_all_urls"]);
    assert.ok(link.target.sha256_cert_fingerprints.length > 0);
    for (const fingerprint of link.target.sha256_cert_fingerprints) assert.match(fingerprint, /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/);
  }
}
for (const path of ["/today", "/invite", "/onboarding", "/classes", "/check", "/reports", "/ask", "/settings", "/admin/invites", "/suspended"]) {
  const response = await fetch(baseURL + path, { redirect: "manual" });
  assert.equal(response.status, 307, path);
  assert.equal(new URL(response.headers.get("location"), baseURL).pathname, "/login", path);
}
assert.equal((await fetch(baseURL + "/verify-email")).status, 200);
console.log("Public assetlinks JSON and existing access guards pass");
