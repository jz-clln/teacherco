import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ActivitySlotFields } from "@/features/exams/components/activity-slot-fields";
import { defaultActivitySlots, type ActivityChoice } from "@/lib/exams/activity-slots";

beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);
function Form({ choices = defaultActivitySlots() }: { choices?: ActivityChoice[] }) {
  const [value, setValue] = useState("");
  return <form><ActivitySlotFields choices={choices} value={value} onChange={setValue} classId="class-1" /></form>;
}
describe("class record activity selector", () => {
  it("offers three terms and clears the previous activity when the term changes", () => {
    const { container } = render(<Form />);
    fireEvent.click(screen.getByRole("combobox", { name: /Class record activity/ }));
    fireEvent.click(screen.getByRole("option", { name: "Performance Task 2" }));
    expect(container.querySelector<HTMLInputElement>('input[name="activitySlot"]')?.value).toBe("Term 1 \u00b7 Performance Task 2");
    fireEvent.click(screen.getByRole("combobox", { name: "Term" }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Term 1", "Term 2", "Term 3"]);
    fireEvent.click(screen.getByRole("option", { name: "Term 2" }));
    expect(container.querySelector<HTMLInputElement>('input[name="activitySlot"]')?.value).toBe("");
    fireEvent.click(screen.getByRole("combobox", { name: /Class record activity/ }));
    fireEvent.click(screen.getByRole("option", { name: "Performance Task 2" }));
    expect(container.querySelector<HTMLInputElement>('input[name="activitySlot"]')?.value).toBe("Term 2 \u00b7 Performance Task 2");
  });
  it("shows the existing assessment instead of silently assigning a duplicate", () => {
    const choices = defaultActivitySlots().map((s) => ({ ...s, assessmentId: "existing", assessmentTitle: "Respect at home", source: "manual" }));
    render(<Form choices={choices} />);
    fireEvent.click(screen.getByRole("combobox", { name: /Class record activity/ }));
    fireEvent.click(screen.getByRole("option", { name: "Performance Task 2 (already assigned)" }));
    expect(screen.getByRole("status").textContent).toContain("Respect at home");
    expect(screen.getByRole("link", { name: "Open existing activity" }).getAttribute("href")).toBe("/classes/class-1/scores?a=existing");
  });
});
