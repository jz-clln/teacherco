import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), push: vi.fn() }));
vi.mock("@/features/classes/actions", () => ({ createClass: mocks.create }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
import { CreateClassForm } from "@/features/classes/create-class-form";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());
function setup() {
  render(<CreateClassForm><input name="name" aria-label="Class" defaultValue="Einstein" /></CreateClassForm>);
  return screen.getByRole("button", { name: "Create class" }).closest("form")!;
}

it("blocks rapid repeated submissions and stays busy until navigation", async () => {
  let finish!: (value: { id: string }) => void;
  mocks.create.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const form = setup();
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Creating class…" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Saving your class");
  finish({ id: "saved-class" });
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/classes/saved-class"));
  fireEvent.submit(form);
  expect(mocks.create).toHaveBeenCalledTimes(1);
});

it("keeps inputs and the same request ID after a lost response", async () => {
  mocks.create.mockRejectedValueOnce(new Error("connection lost")).mockResolvedValueOnce({ id: "saved-class" });
  const form = setup();
  fireEvent.submit(form);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not connect");
  expect(screen.getByLabelText("Class")).toHaveValue("Einstein");
  expect(screen.getByRole("button", { name: "Create class" })).not.toBeDisabled();
  fireEvent.submit(form);
  await waitFor(() => expect(mocks.push).toHaveBeenCalled());
  expect(mocks.create.mock.calls[0][0].get("requestId")).toBe(mocks.create.mock.calls[1][0].get("requestId"));
});
