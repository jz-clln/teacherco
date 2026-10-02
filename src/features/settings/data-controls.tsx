// src/features/settings/data-controls.tsx

"use client";

import { useActionState, useState, useTransition } from "react";
import { Download, FileX2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearAllOfflineData, clearOfflineClass } from "@/lib/offline/cache";
import {
  deleteAllData,
  deleteClass,
  removeStoredFiles,
  updateRetention,
  type SettingsState,
} from "./actions";
import { DangerButton, FormFooter, StatusMessage, inputClass } from "./settings-ui";

const initialState: SettingsState = {};

export type ClassRow = {
  id: string;
  name: string;
  subject: string;
  gradeLevel: string;
  schoolYear: string;
};

const retentionOptions = [
  {
    value: "keep",
    title: "Keep my original files",
    text: "Stay available in TeacherCo so you can re-open or re-import them.",
  },
  {
    value: "delete_after_processing",
    title: "Delete after importing",
    text: "TeacherCo keeps the organized records and removes the uploaded file once it is read.",
  },
] as const;

function RetentionForm({ mode }: { mode: "keep" | "delete_after_processing" }) {
  const [state, formAction, pending] = useActionState(updateRetention, initialState);

  return (
    <form action={formAction}>
      <p className="text-sm font-semibold text-[#313832]">Original uploaded files</p>
      <p className="mt-1 text-xs leading-5 text-[#8B928C]">
        This is the default for new uploads. You can still change it each time you import a record.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {retentionOptions.map((option) => (
          <label
            key={option.value}
            className="cursor-pointer rounded-2xl border border-[#E3E5E1] bg-white p-4 transition hover:border-[#D5E0D5] has-checked:border-[#4F6F52] has-checked:bg-[#F4F7F4] has-checked:ring-4 has-checked:ring-[#4F6F52]/10"
          >
            <input type="radio" name="retentionMode" value={option.value} defaultChecked={mode === option.value} className="sr-only" />
            <span className="block text-sm font-semibold text-[#313832]">{option.title}</span>
            <span className="mt-1 block text-xs leading-5 text-[#8B928C]">{option.text}</span>
          </label>
        ))}
      </div>
      <FormFooter state={state} pending={pending} />
    </form>
  );
}

function ConfirmPanel({
  prompt,
  expected,
  typed,
  onTyped,
  confirmLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  prompt: string;
  expected?: string;
  typed: string;
  onTyped: (value: string) => void;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ready = !expected || typed.trim() === expected;

  return (
    <div className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-4">
      <p className="text-sm leading-6 text-red-800">{prompt}</p>
      {expected ? (
        <input
          value={typed}
          onChange={(event) => onTyped(event.target.value)}
          placeholder={expected}
          aria-label={`Type ${expected} to confirm`}
          autoComplete="off"
          className={inputClass}
        />
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <DangerButton disabled={!ready || pending} onClick={onConfirm}>
          {pending ? "Working…" : confirmLabel}
        </DangerButton>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function DataControls({
  classes,
  retentionMode,
}: {
  classes: ClassRow[];
  retentionMode: "keep" | "delete_after_processing";
}) {
  const [message, setMessage] = useState<SettingsState>({});
  const [pending, startTransition] = useTransition();
  // "files", "all", or "class:{id}" — only one confirmation is open at a time.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  function open(key: string) {
    setConfirming(key);
    setTyped("");
    setMessage({});
  }

  function close() {
    setConfirming(null);
    setTyped("");
  }

  function run(task: () => Promise<SettingsState>, afterSuccess?: () => Promise<void>) {
    startTransition(async () => {
      const result = await task();
      if (result.success) {
        await afterSuccess?.();
        close();
      }
      setMessage(result);
    });
  }

  function confirmDeleteClass(teacherClass: ClassRow) {
    const formData = new FormData();
    formData.set("classId", teacherClass.id);
    formData.set("confirmation", typed);
    run(() => deleteClass(formData), () => clearOfflineClass(teacherClass.id));
  }

  function confirmDeleteAll() {
    const formData = new FormData();
    formData.set("confirmation", typed);
    run(() => deleteAllData(formData), clearAllOfflineData);
  }

  return (
    <div className="grid gap-8">
      <RetentionForm mode={retentionMode} />

      <div className="border-t border-[#E3E5E1] pt-6">
        <p className="text-sm font-semibold text-[#313832]">Export your data</p>
        <p className="mt-1 text-xs leading-5 text-[#8B928C]">
          Download your profile, classes, learners, assessments, scores, attendance, notes, and reports as one JSON file. Uploaded files and photos are not included.
        </p>
        <a
          href="/api/settings/export"
          download
          className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#EAF0EA] px-4 py-2 text-sm font-semibold text-[#1A4D2E] transition hover:bg-[#D5E0D5]"
        >
          <Download size={17} /> Download my data
        </a>
      </div>

      <div className="border-t border-[#E3E5E1] pt-6">
        <p className="text-sm font-semibold text-[#313832]">Delete stored files</p>
        <p className="mt-1 text-xs leading-5 text-[#8B928C]">
          Removes every original upload and answer sheet photo. The records TeacherCo already imported stay exactly as they are.
        </p>
        {confirming === "files" ? (
          <ConfirmPanel
            prompt="Remove all of your stored uploads and answer sheet photos? This cannot be undone."
            typed={typed}
            onTyped={setTyped}
            confirmLabel="Yes, remove files"
            pending={pending}
            onConfirm={() => run(removeStoredFiles)}
            onCancel={close}
          />
        ) : (
          <Button type="button" variant="secondary" className="mt-3 gap-2" onClick={() => open("files")}>
            <FileX2 size={17} /> Remove stored files
          </Button>
        )}
      </div>

      <div className="border-t border-[#E3E5E1] pt-6">
        <p className="text-sm font-semibold text-red-700">Danger zone</p>
        <p className="mt-1 text-xs leading-5 text-[#8B928C]">
          Deleting a class permanently removes its learners, scores, attendance, assessments, competencies, reports, and files. Export first if you might need them.
        </p>

        <div className="mt-3 grid gap-3" aria-live="polite">
          <StatusMessage state={message} />
        </div>

        {classes.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-[#E3E5E1] bg-[#FAFAF8] p-4 text-sm text-[#606861]">You have no classes yet.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {classes.map((teacherClass) => {
              const key = `class:${teacherClass.id}`;
              return (
                <li key={teacherClass.id} className="rounded-2xl border border-[#E3E5E1] bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#313832]">{teacherClass.name}</p>
                      <p className="mt-0.5 text-xs text-[#8B928C]">
                        {teacherClass.subject} · {teacherClass.gradeLevel} · SY {teacherClass.schoolYear}
                      </p>
                    </div>
                    {confirming !== key ? (
                      <Button type="button" variant="secondary" className="gap-2" onClick={() => open(key)}>
                        <Trash2 size={16} /> Delete class
                      </Button>
                    ) : null}
                  </div>
                  {confirming === key ? (
                    <ConfirmPanel
                      prompt={`To permanently delete this class and everything in it, type its name: ${teacherClass.name}`}
                      expected={teacherClass.name}
                      typed={typed}
                      onTyped={setTyped}
                      confirmLabel="Delete class forever"
                      pending={pending}
                      onConfirm={() => confirmDeleteClass(teacherClass)}
                      onCancel={close}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-3 rounded-2xl border border-red-100 bg-white p-4">
          <p className="text-sm font-semibold text-[#313832]">Delete all my classroom data</p>
          <p className="mt-1 text-xs leading-5 text-[#8B928C]">
            Removes every class, learner, note, report, and file. Your account and settings are kept.
          </p>
          {confirming === "all" ? (
            <ConfirmPanel
              prompt="This permanently deletes all of your classroom data and cannot be undone. Type DELETE to continue."
              expected="DELETE"
              typed={typed}
              onTyped={setTyped}
              confirmLabel="Delete everything"
              pending={pending}
              onConfirm={confirmDeleteAll}
              onCancel={close}
            />
          ) : (
            <DangerButton className="mt-3" onClick={() => open("all")}>
              <Trash2 size={16} /> Delete all data
            </DangerButton>
          )}
        </div>
      </div>
    </div>
  );
}