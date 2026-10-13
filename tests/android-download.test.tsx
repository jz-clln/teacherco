import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AndroidApkLink } from "@/components/pwa/android-apk-link";

beforeEach(()=>{vi.spyOn(navigator,"userAgent","get").mockReturnValue("Mozilla/5.0 (Linux; Android 14)");});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
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

it.each(['Windows NT 10.0','Macintosh Intel Mac OS X','iPhone Safari'])('hides APK downloads on %s',userAgent=>{
 vi.stubEnv('NEXT_PUBLIC_ANDROID_APK_URL','https://example.test/teacherco.apk');vi.spyOn(navigator,'userAgent','get').mockReturnValue(userAgent);render(<AndroidApkLink/>);expect(screen.queryByRole('link')).toBeNull();
});
