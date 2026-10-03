import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { LandingHeader } from "@/components/landing/landing-header";

afterEach(cleanup);
it("links to the existing login and access-request routes", () => {
  render(<LandingHeader destination={null} />);
  expect(screen.getByRole("link", { name: "Login" })).toHaveAttribute("href", "/login");
  expect(screen.getByRole("link", { name: "Request Early Access" })).toHaveAttribute("href", "/request-access");
});
it.each(["/invite", "/onboarding", "/today", "/suspended"])("links authenticated visitors to %s", destination => {
  render(<LandingHeader destination={destination} />);
  expect(screen.getByRole("link", { name: "Go to TeacherCo" })).toHaveAttribute("href", destination);
  expect(screen.queryByRole("link", { name: "Login" })).toBeNull();
});
it("opens the menu and restores focus on Escape", () => {
  render(<LandingHeader destination={null} />);
  const toggle = screen.getByRole("button", { name: "Open navigation" });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("navigation", { name: "Mobile navigation" })).not.toHaveAttribute("hidden");
  fireEvent.keyDown(toggle, { key: "Escape" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(toggle).toHaveFocus();
});
