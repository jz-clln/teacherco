import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InstallTeacherCoButton } from "@/components/pwa/install-teacherco-button";
import { isIOSDevice } from "@/lib/pwa/platform";

let standalone = false;
beforeEach(() => {
  standalone = false;
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("matchMedia", () => ({ matches: standalone, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Chrome desktop");
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
  Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 0 });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function installEvent(outcome: "accepted" | "dismissed") {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: "web" }) });
  act(() => window.dispatchEvent(event));
  return { event, prompt };
}

it("renders a usable browser link without JavaScript install capability or SSR browser APIs", () => {
  expect(renderToString(<InstallTeacherCoButton destination={null} />)).toContain('href="/login"');
  render(<InstallTeacherCoButton destination={null} />);
  expect(screen.getByRole("link", { name: "Continue in browser" })).toHaveAttribute("href", "/login");
});
it("captures the event but prompts only on an explicit click, once", async () => {
  render(<InstallTeacherCoButton destination={null} />);
  const { event, prompt } = installEvent("dismissed");
  expect(event.defaultPrevented).toBe(true);
  expect(prompt).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Install TeacherCo" }));
  await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole("link", { name: "Continue in browser" })).toBeVisible();
  expect(screen.queryByRole("link", { name: "Open TeacherCo" })).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("keep using TeacherCo");
});
it("does not confuse acceptance with completed installation; appinstalled updates the UI", async () => {
  render(<InstallTeacherCoButton destination="/invite" />);
  installEvent("accepted");
  fireEvent.click(screen.getByRole("button", { name: "Install TeacherCo" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Installation requested");
  expect(screen.queryByRole("link", { name: "Open TeacherCo" })).toBeNull();
  act(() => window.dispatchEvent(new Event("appinstalled")));
  expect(screen.getByRole("link", { name: "Open TeacherCo" })).toHaveAttribute("href", "/invite");
});
it.each(["/invite", "/onboarding", "/today", "/suspended"])("standalone uses the existing resolved %s destination", destination => {
  standalone = true;
  render(<InstallTeacherCoButton destination={destination} />);
  expect(screen.getByRole("link", { name: "Open TeacherCo" })).toHaveAttribute("href", destination);
  expect(screen.queryByRole("button", { name: "Install TeacherCo" })).toBeNull();
});
it("shows iOS instructions only on click and closes on Escape", () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("iPhone Safari");
  render(<InstallTeacherCoButton destination={null} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  const button = screen.getByRole("button", { name: "Install TeacherCo" });
  button.focus();
  fireEvent.click(button);
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveTextContent("Add to Home Screen");
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(button).toHaveFocus();
});
it("recognizes iPadOS desktop identification without classifying a Mac as iPad", () => {
  expect(isIOSDevice({ userAgent: "Macintosh", platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
  expect(isIOSDevice({ userAgent: "Macintosh", platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
});

it('offers Windows installation instructions when the native prompt is unavailable',()=>{
 vi.spyOn(navigator,'userAgent','get').mockReturnValue('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140');
 render(<InstallTeacherCoButton destination={null}/>);
 const button=screen.getByRole('button',{name:'Install for Windows'});button.focus();fireEvent.click(button);
 expect(screen.getByRole('dialog')).toHaveTextContent('Microsoft Edge or Google Chrome');
 expect(screen.getByRole('dialog')).toHaveTextContent('Install page as app');
 expect(screen.getByRole('link',{name:'Continue in browser'})).toHaveAttribute('href','/login');
 fireEvent(screen.getByRole('dialog'),new Event('cancel',{cancelable:true}));expect(screen.queryByRole('dialog')).toBeNull();expect(button).toHaveFocus();
});
it('uses the Windows native prompt when available and keeps a fallback after dismissal',async()=>{
 vi.spyOn(navigator,'userAgent','get').mockReturnValue('Windows NT 10.0');render(<InstallTeacherCoButton destination='/today'/>);
 const {prompt}=installEvent('dismissed');fireEvent.click(screen.getByRole('button',{name:'Install for Windows'}));
 await waitFor(()=>expect(prompt).toHaveBeenCalledOnce());await waitFor(()=>expect(screen.getByRole('button',{name:'Install for Windows'})).not.toBeDisabled());
 expect(screen.queryByRole('dialog')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Install for Windows'}));expect(screen.getByRole('dialog')).toBeVisible();
});
it('does not show Windows installation inside the installed app',()=>{
 standalone=true;vi.spyOn(navigator,'userAgent','get').mockReturnValue('Windows NT 10.0');render(<InstallTeacherCoButton destination='/today'/>);
 expect(screen.getByRole('link',{name:'Open TeacherCo'})).toBeVisible();expect(screen.queryByRole('button',{name:'Install for Windows'})).toBeNull();
});
