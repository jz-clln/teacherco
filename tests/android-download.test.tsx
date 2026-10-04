import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AndroidApkLink } from "@/components/pwa/android-apk-link";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
it("does not render a dead APK action", () => {
  vi.stubEnv("NEXT_PUBLIC_ANDROID_APK_URL", "");
  const { container } = render(<AndroidApkLink />);
  expect(container).toBeEmptyDOMElement();
});
it("shows a distinct Android beta link only when configured", () => {
  vi.stubEnv("NEXT_PUBLIC_ANDROID_APK_URL", "https://example.test/teacherco.apk");
  render(<AndroidApkLink />);
  expect(screen.getByRole("link", { name: /Download Android APK/ })).toHaveAttribute("href", "https://example.test/teacherco.apk");
  expect(screen.queryByText("Install TeacherCo")).toBeNull();
});
