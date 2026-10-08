import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveManualScores } from "@/features/scores/actions";
import { ScoreSheet, type ScoreRow } from "@/features/scores/score-sheet";

vi.mock("@/features/scores/actions", () => ({
  saveManualScores: vi.fn(),
  deleteManualAssessment: vi.fn(),
}));

const save = vi.mocked(saveManualScores);

const LEARNERS: ScoreRow[] = [
  { id: "l1", name: "Achilles Cadeliña", score: null },
  { id: "l2", name: "Aldrin Lanuzo", score: null },
  { id: "l3", name: "Alehaicel Coralde", score: 15 },
  { id: "l4", name: "Alishe Hainto", score: null },
];

function setup(learners = LEARNERS, total = 20) {
  return render(<ScoreSheet assessmentId="a1" title="Oral Recitation 1" total={total} learners={learners} />);
}

const box = (name: string) => screen.getByLabelText(`Score for ${name}`) as HTMLInputElement;
const type = (name: string, text: string) => fireEvent.change(box(name), { target: { value: text } });
const enter = (name: string) => fireEvent.keyDown(box(name), { key: "Enter" });

/** Lets the 500 ms save delay pass and the save finish. */
const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(700)));

/** The fields a save request carried, e.g. { score_l1: "18" } (the activity id is checked separately). */
function lastSave() {
  const data = save.mock.calls.at(-1)![1] as FormData;
  const fields = Object.fromEntries([...data.entries()].map(([k, v]) => [k, String(v)]));
  const { assessmentId, ...scores } = fields;
  return { assessmentId, scores };
}

beforeEach(() => {
  vi.useFakeTimers();
  save.mockReset();
  save.mockResolvedValue({ success: "saved" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ScoreSheet", () => {
  it("shows every learner with a phone number keypad and a Next key", () => {
    setup();
    expect(screen.getByText("1 of 4 scored")).toBeInTheDocument();
    for (const l of LEARNERS) {
      const input = box(l.name);
      expect(input).toHaveAttribute("inputmode", "decimal");
      expect(input).toHaveAttribute("enterkeyhint", "next");
    }
    expect(box("Alehaicel Coralde").value).toBe("15");
  });

  it("types a score, presses Enter, lands on the next learner, and saves only that score", async () => {
    setup();
    act(() => box("Achilles Cadeliña").focus());
    type("Achilles Cadeliña", "18");
    enter("Achilles Cadeliña");
    expect(box("Aldrin Lanuzo")).toHaveFocus();

    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    const { assessmentId, scores } = lastSave();
    expect(assessmentId).toBe("a1");
    expect(scores).toEqual({ score_l1: "18" }); // nobody else is sent
    expect(screen.getByText("All changes saved")).toBeInTheDocument();
  });

  it("sends a quick run down the list as ONE save", async () => {
    setup();
    act(() => box("Achilles Cadeliña").focus());
    type("Achilles Cadeliña", "18");
    enter("Achilles Cadeliña");
    type("Aldrin Lanuzo", "12,5"); // a comma works too
    enter("Aldrin Lanuzo");

    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    expect(lastSave().scores).toEqual({ score_l1: "18", score_l2: "12,5" });
  });

  it("does not save when nothing changed", async () => {
    setup();
    box("Alehaicel Coralde").focus();
    type("Alehaicel Coralde", "15.0"); // same number as the saved 15
    enter("Alehaicel Coralde");
    await settle();
    expect(save).not.toHaveBeenCalled();
  });

  it("clearing a saved score sends a blank, which removes it. Blank is never zero", async () => {
    setup();
    box("Alehaicel Coralde").focus();
    type("Alehaicel Coralde", "");
    enter("Alehaicel Coralde");
    await settle();
    expect(lastSave().scores).toEqual({ score_l3: "" });
  });

  it("flags a score above the highest possible score and does not send it, but still sends the others", async () => {
    setup();
    act(() => box("Achilles Cadeliña").focus());
    type("Achilles Cadeliña", "25");
    enter("Achilles Cadeliña");
    type("Aldrin Lanuzo", "10");
    enter("Aldrin Lanuzo");

    await settle();
    expect(box("Achilles Cadeliña")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Fix 1 highlighted score")).toBeInTheDocument();
    expect(lastSave().scores).toEqual({ score_l2: "10" });
  });

  it("rejects text and negative numbers", async () => {
    setup();
    act(() => box("Achilles Cadeliña").focus());
    type("Achilles Cadeliña", "abc");
    enter("Achilles Cadeliña");
    type("Aldrin Lanuzo", "-3");
    enter("Aldrin Lanuzo");
    await settle();
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText("Fix 2 highlighted scores")).toBeInTheDocument();
  });

  it("shows a failed save with a Retry that sends it again", async () => {
    save.mockResolvedValueOnce({ error: "TeacherCo could not save the scores. Nothing was changed. Please try again." });
    setup();
    act(() => box("Achilles Cadeliña").focus());
    type("Achilles Cadeliña", "18");
    enter("Achilles Cadeliña");
    await settle();

    expect(screen.getByText("1 not saved")).toBeInTheDocument();
    expect(screen.getByText(/Nothing was changed/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await settle();
    expect(save).toHaveBeenCalledTimes(2);
    expect(lastSave().scores).toEqual({ score_l1: "18" });
    expect(screen.getByText("All changes saved")).toBeInTheDocument();
  });

  it("treats a network failure like a failed save", async () => {
    save.mockRejectedValueOnce(new Error("offline"));
    setup();
    act(() => box("Achilles Cadeliña").focus());
    type("Achilles Cadeliña", "7");
    enter("Achilles Cadeliña");
    await settle();
    expect(screen.getByText("1 not saved")).toBeInTheDocument();
  });

  it("sends a score typed again while the first save was still running", async () => {
    let finishFirst: (value: { success: string }) => void = () => {};
    save.mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)));
    setup();
    act(() => box("Achilles Cadeliña").focus());
    type("Achilles Cadeliña", "10");
    enter("Achilles Cadeliña");
    await act(async () => void (await vi.advanceTimersByTimeAsync(600))); // first save is now in flight

    type("Achilles Cadeliña", "12");
    fireEvent.blur(box("Achilles Cadeliña"));
    await act(async () => finishFirst({ success: "saved" }));
    await settle();

    expect(save).toHaveBeenCalledTimes(2);
    expect(lastSave().scores).toEqual({ score_l1: "12" });
  });

  it("Enter on the last learner closes the keyboard instead of going nowhere", () => {
    setup();
    box("Alishe Hainto").focus();
    type("Alishe Hainto", "9");
    enter("Alishe Hainto");
    expect(box("Alishe Hainto")).not.toHaveFocus();
  });

  it("arrow keys move between learners", () => {
    setup();
    box("Aldrin Lanuzo").focus();
    fireEvent.keyDown(box("Aldrin Lanuzo"), { key: "ArrowDown" });
    expect(box("Alehaicel Coralde")).toHaveFocus();
    fireEvent.keyDown(box("Alehaicel Coralde"), { key: "ArrowUp" });
    expect(box("Aldrin Lanuzo")).toHaveFocus();
  });

  it("Start scoring jumps to the first learner without a score", () => {
    setup([{ id: "l1", name: "Achilles Cadeliña", score: 20 }, ...LEARNERS.slice(1)]);
    fireEvent.click(screen.getByRole("button", { name: /Continue with next blank/ }));
    expect(box("Aldrin Lanuzo")).toHaveFocus();
  });

  it('"Show only learners without a score" hides scored rows and keeps a row you are typing in', () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Show only learners without a score/ }));
    expect(screen.queryByLabelText("Score for Alehaicel Coralde")).not.toBeInTheDocument();

    type("Achilles Cadeliña", "18"); // it now has a score, but must not vanish while you work
    expect(box("Achilles Cadeliña")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Show only learners without a score/ }));
    expect(box("Alehaicel Coralde")).toBeInTheDocument();
  });

  it("shows a Prev / Next bar while a box is focused, so phones without a Next key still work", () => {
    setup();
    act(() => box("Achilles Cadeliña").focus());
    expect(screen.getByRole("toolbar", { name: "Score entry" })).toBeInTheDocument();

    type("Achilles Cadeliña", "14");
    fireEvent.click(screen.getByRole("button", { name: "Next learner" }));
    expect(box("Aldrin Lanuzo")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Previous learner" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(box("Aldrin Lanuzo")).not.toHaveFocus();
  });

  it("the progress counts only valid scores", () => {
    setup();
    type("Achilles Cadeliña", "18");
    type("Aldrin Lanuzo", "99"); // too high, does not count
    expect(screen.getByText("2 of 4 scored")).toBeInTheDocument();
  });

  it("says so when the class has no learners", () => {
    setup([]);
    expect(screen.getByText(/no active learners/i)).toBeInTheDocument();
  });
});