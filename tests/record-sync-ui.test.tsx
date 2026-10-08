import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecordSync } from "@/features/records/record-sync";

const mocks = vi.hoisted(() => ({ preview: vi.fn(), apply: vi.fn(), history: vi.fn(), read: vi.fn(), refresh: vi.fn(), changes: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/features/records/sync-actions", () => ({ previewRecordSync: mocks.preview, applyRecordSync: mocks.apply, listSyncVersions: mocks.history, readSyncVersion: vi.fn(), readSyncChanges: mocks.changes }));
vi.mock("@/features/records/read-sync-workbook", () => ({ readSyncWorkbook: mocks.read }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ input: { filename: "updated.xlsx", learners: [{ firstName: "Ana", lastName: "Cruz" }], sheets: [{ term: 1 }], attendance: [] }, warnings: [], display: [{ firstName: "Ana", lastName: "Cruz", sex: "female" }] });
  mocks.preview.mockResolvedValue({ ok: true, data: { revision: 1, count: 1, changes: [{ kind: "score", label: "Ana Cruz · Written Work 1", before: "8/10", after: "9/10" }] } });
  mocks.history.mockResolvedValue({ ok: true, data: [] });
});
afterEach(cleanup);
it("opens the linked version and lazily loads its existing comparison", async () => {
  mocks.changes.mockResolvedValue({ ok: true, data: [{ kind: "score", label: "Ana Cruz", before: "8/10", after: "9/10" }] });
  render(<RecordSync classId="class" className="Grade 1" initialVersions={[{ id: "linked", version_number: 1, filename: "saved.xlsx", created_at: "2026-10-01T00:00:00Z", change_count: 1 }]} initialOpenVersion="linked" />);
  await waitFor(() => expect(mocks.changes).toHaveBeenCalledWith("class", "linked"));
  expect(document.getElementById("version-linked")).toHaveAttribute("open");
  await screen.findByText("9/10");
});
async function review() {
  render(<RecordSync classId="class" className="Grade 1" initialVersions={[]} />);
  fireEvent.change(screen.getByLabelText(/Updated class record/), { target: { files: [new File(["test"], "updated.xlsx")] } });
  await screen.findByRole("button", { name: "Apply 1 changes" });
}
it("shows comparison without saving and requires teacher review", async () => {
  await review(); expect(mocks.apply).not.toHaveBeenCalled();
  expect(screen.getByText("8/10")).toBeInTheDocument(); expect(screen.getByText("9/10")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Apply 1 changes" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox")); expect(screen.getByRole("button", { name: "Apply 1 changes" })).toBeEnabled();
});
it("locks repeated clicks, shows saving feedback and keeps the request ID on retry", async () => {
  let resolve!: (value: unknown) => void;
  mocks.apply.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await review(); fireEvent.click(screen.getByRole("checkbox"));
  const button = screen.getByRole("button", { name: "Apply 1 changes" });
  fireEvent.click(button); fireEvent.click(button);
  expect(mocks.apply).toHaveBeenCalledTimes(1); expect(screen.getByText(/Saving changes/)).toHaveAttribute("role", "status");
  await act(async () => resolve({ ok: false, error: "Connection interrupted. Retry." }));
  expect(screen.getByRole("alert")).toHaveTextContent("Connection interrupted");
  mocks.apply.mockResolvedValueOnce({ ok: true, data: { version: 2 } });
  fireEvent.click(screen.getByRole("button", { name: "Apply 1 changes" }));
  await waitFor(() => expect(screen.getByText(/Record synced. Version 2/)).toHaveAttribute("role", "status"));
  expect(mocks.apply.mock.calls[1][3]).toBe(mocks.apply.mock.calls[0][3]); expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("reports unchanged files without an apply button", async () => {
  mocks.preview.mockResolvedValue({ ok: true, data: { revision: 1, count: 0, changes: [] } });
  render(<RecordSync classId="class" className="Grade 1" initialVersions={[]} />);
  fireEvent.change(screen.getByLabelText(/Updated class record/), { target: { files: [new File(["test"], "updated.xlsx")] } });
  await screen.findByText(/No new or corrected data/); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument(); expect(mocks.apply).not.toHaveBeenCalled();
});
