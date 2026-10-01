import { expect, test } from "@playwright/test";

test("health endpoint responds", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({ ok: true, service: "teacherco" });
});
