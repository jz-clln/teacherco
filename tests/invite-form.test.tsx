import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ redeem: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("@/features/invites/actions", () => ({ redeemInvite: mocks.redeem }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
import { InviteForm } from "@/features/invites/components/invite-form";
import { INVALID_INVITE } from "@/features/invites/validation";

afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); });
const input = () => screen.getByLabelText("Invite code") as HTMLInputElement;
describe("invite form", () => {
  it("does not truncate a malformed paste into a valid code", () => {
    render(<InviteForm />);
    fireEvent.paste(input(), { clipboardData: { getData: () => "A7K2-P9XM-4QTR-extra" } });
    expect(input().value).toBe("");
    expect(screen.getByRole("alert")).toHaveTextContent(INVALID_INVITE);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(mocks.redeem).not.toHaveBeenCalled();
  });
  it("keeps pasted letter case and shows a generic failure", async () => {
    mocks.redeem.mockResolvedValue({ error: INVALID_INVITE });
    render(<InviteForm />);
    fireEvent.paste(input(), { clipboardData: { getData: () => "a7K2-P9XM-4QTR" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(mocks.redeem).toHaveBeenCalledWith("a7K2-P9XM-4QTR"));
    expect(await screen.findByRole("alert")).toHaveTextContent(INVALID_INVITE);
  });
  it("shows a network error and allows retry", async () => {
    mocks.redeem.mockRejectedValue(new Error("network"));
    render(<InviteForm />);
    fireEvent.change(input(), { target: { value: "A7K2-P9XM-4QTR" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not connect");
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).not.toBeDisabled());
  });
  it("shows activation before redirecting to onboarding", async () => {
    mocks.redeem.mockResolvedValue({ success: "Access activated" });
    render(<InviteForm />);
    fireEvent.change(input(), { target: { value: "A7K2-P9XM-4QTR" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Access activated");
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/onboarding"), { timeout: 2000 });
  });
});
