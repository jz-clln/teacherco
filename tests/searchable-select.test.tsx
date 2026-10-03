// tests/searchable-select.test.tsx

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchableSelect } from "@/components/ui/searchable-select";

afterEach(cleanup);

const learners = [
  { value: "1", label: "Achilles Asher C. Cadeliña" },
  { value: "2", label: "Aldrin Lanuzo" },
  { value: "3", label: "Michaela P. Almonte" },
];

function setup(options = learners) {
  const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
  const onChange = vi.fn();
  const view = render(
    <form onSubmit={onSubmit}>
      <SearchableSelect
        name="learnerId"
        label="Learner"
        required
        placeholder="Choose a learner"
        searchPlaceholder="Search learners…"
        emptyText="No learner matches your search."
        options={options}
        onChange={onChange}
      />
    </form>,
  );
  const form = view.container.querySelector("form") as HTMLFormElement;
  const field = () => form.querySelector('input[name="learnerId"]') as HTMLInputElement;
  const trigger = () => screen.getByRole("combobox", { name: "Learner" }) as HTMLButtonElement;
  const open = () => {
    fireEvent.click(trigger());
    return screen.getByRole("textbox", { name: "Search learners…" }) as HTMLInputElement;
  };
  return { form, field, trigger, open, onSubmit, onChange };
}

describe("SearchableSelect", () => {
  it("opens with every learner listed and the search box ready to type", () => {
    const { open } = setup();
    const search = open();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(document.activeElement).toBe(search);
  });

  it("filters while typing, ignoring case and accents", () => {
    const { open } = setup();
    const search = open();
    fireEvent.change(search, { target: { value: "CADELINA" } });
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain("Achilles Asher C. Cadeliña");
  });

  it("says so when nobody matches", () => {
    const { open } = setup();
    fireEvent.change(open(), { target: { value: "zzz" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("No learner matches your search.")).toBeTruthy();
  });

  it("chooses a learner by click and sends the id with the form", () => {
    const { open, field, trigger, onChange } = setup();
    open();
    fireEvent.click(screen.getByRole("option", { name: /Aldrin Lanuzo/ }));
    expect(field().value).toBe("2");
    expect(onChange).toHaveBeenCalledWith("2");
    expect(trigger().textContent).toContain("Aldrin Lanuzo");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(new FormData(field().form!).get("learnerId")).toBe("2");
  });

  it("chooses with the keyboard, and Enter never submits the form", () => {
    const { open, field, onSubmit } = setup();
    const search = open();
    fireEvent.keyDown(search, { key: "ArrowDown" });
    const notCancelled = fireEvent.keyDown(search, { key: "Enter" });
    expect(notCancelled).toBe(false); // preventDefault was called, so the browser will not submit
    expect(field().value).toBe("2");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("chooses the first match after typing, then Enter", () => {
    const { open, field } = setup();
    const search = open();
    fireEvent.change(search, { target: { value: "monte" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(field().value).toBe("3");
  });

  it("closes on Escape without changing the choice", () => {
    const { open, field } = setup();
    fireEvent.keyDown(open(), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(field().value).toBe("");
  });

  it("closes when the user taps elsewhere", () => {
    const { open } = setup();
    open();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("asks the browser to require a choice", () => {
    const { open, form } = setup();
    expect(form.checkValidity()).toBe(false);
    open();
    fireEvent.click(screen.getByRole("option", { name: /Michaela/ }));
    expect(form.checkValidity()).toBe(true);
  });

  it("is disabled when there is nobody to choose", () => {
    const { trigger } = setup([]);
    expect(trigger().disabled).toBe(true);
  });
});