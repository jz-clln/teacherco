"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FormFooter, inputClass, labelClass } from "@/features/settings/settings-ui";
import { saveGradingConfig, type GradingSettingsState } from "./actions";
import type { GradingClassSetting } from "./queries";
import type { TransmutationRow, DescriptorRow } from "@/lib/grading/deped";

const emptyState: GradingSettingsState = {};
const componentFields = [
  { key: "written_work", label: "Written / Oral Works" },
  { key: "performance_task", label: "Product / Performance Tasks" },
  { key: "assessment", label: "Summative Tests & Term Exam" },
] as const;

function GradingRulesForm({ classroom }: { classroom: GradingClassSetting }) {
  const [state, action, pending] = useActionState(saveGradingConfig, emptyState);
  const [weights, setWeights] = useState({ ...classroom.config.weights });
  const [transmutation, setTransmutation] = useState(classroom.config.transmutation.map((row) => ({ ...row })));
  const [descriptors, setDescriptors] = useState(classroom.config.descriptors.map((row) => ({ ...row })));
  const totalWeight = Object.values(weights).reduce((total, weight) => total + weight, 0);

  function updateTransmutation(index: number, patch: Partial<TransmutationRow>) {
    setTransmutation((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  function updateDescriptor(index: number, patch: Partial<DescriptorRow>) {
    setDescriptors((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  function resetToPreset() {
    setWeights({ ...classroom.defaultConfig.weights });
    setTransmutation(classroom.defaultConfig.transmutation.map((row) => ({ ...row })));
    setDescriptors(classroom.defaultConfig.descriptors.map((row) => ({ ...row })));
  }

  function addBand() {
    setTransmutation((rows) => {
      const last = rows[rows.length - 1];
      if (!last || last.min >= 100 || last.grade >= 100) return rows;
      const min = Math.min(100, Math.round((last.min + 1) * 100) / 100);
      return [...rows, { min, max: 100, grade: Math.min(100, last.grade + 1) }];
    });
  }

  function addDescriptor() {
    setDescriptors((rows) => {
      const last = rows[rows.length - 1];
      if (!last || last.min >= 100) return rows;
      return [...rows, { min: Math.min(100, last.min + 1), label: "" }];
    });
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="classId" value={classroom.id} />
      <input type="hidden" name="weights" value={JSON.stringify(weights)} />
      <input type="hidden" name="transmutation" value={JSON.stringify(transmutation)} />
      <input type="hidden" name="descriptors" value={JSON.stringify(descriptors)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#606861]">
          {classroom.customized
            ? classroom.sourceFilename ? `Imported from ${classroom.sourceFilename}` : "Teacher-customized rules"
            : `Subject default for ${classroom.subject}`}
        </p>
        <Button type="button" variant="secondary" onClick={resetToPreset} className="min-h-10 gap-2 px-3 py-2 text-sm">
          <RotateCcw size={16} /> Reset to subject default
        </Button>
      </div>
      <p className="text-sm leading-5 text-[#606861]">Saving rules updates calculated term grades for this class. Imported scores stay unchanged.</p>

      <fieldset>
        <legend className={labelClass}>Component weights</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {componentFields.map(({ key, label: text }) => (
            <label key={key} className="block text-sm font-medium text-[#313832]">
              {text}
              <div className="relative mt-1.5">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={Math.round(weights[key] * 10000) / 100}
                  onChange={(event) => setWeights((current) => ({ ...current, [key]: Number(event.target.value) / 100 }))}
                  className={`${inputClass} pr-9`}
                  aria-label={`${text} weight percentage`}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[#747D76]">%</span>
              </div>
            </label>
          ))}
        </div>
        <p className={`mt-2 text-sm ${Math.abs(totalWeight - 1) < 0.001 ? "text-[#606861]" : "font-medium text-amber-800"}`}>
          Total: {Math.round(totalWeight * 10000) / 100}%{Math.abs(totalWeight - 1) < 0.001 ? "" : " · must equal 100%"}
        </p>
      </fieldset>

      <details className="rounded-xl border border-[#E3E5E1]">
        <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-[#28332B]">Transmutation table · {transmutation.length} bands</summary>
        <div className="border-t border-[#E3E5E1] p-4">
          <p className="mb-3 text-sm leading-5 text-[#606861]">Initial Grades map to the Term Grade for the row whose minimum is the highest value not exceeding the Initial Grade.</p>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 border-b border-[#E3E5E1] pb-2 text-xs font-semibold text-[#606861]">
            <span>Initial Grade from</span><span>Term Grade</span><span className="sr-only">Remove</span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {transmutation.map((row, index) => (
              <div key={`${index}-${row.min}`} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 border-b border-[#E3E5E1]/70 py-1.5">
                <input type="number" min="0" max="100" step="0.01" value={row.min} onChange={(event) => updateTransmutation(index, { min: Number(event.target.value) })} className={inputClass} aria-label={`Transmutation band ${index + 1} minimum`} />
                <input type="number" min="0" max="100" step="1" value={row.grade} onChange={(event) => updateTransmutation(index, { grade: Number(event.target.value) })} className={inputClass} aria-label={`Transmutation band ${index + 1} term grade`} />
                <button type="button" onClick={() => setTransmutation((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} disabled={transmutation.length <= 2} aria-label={`Remove transmutation band ${index + 1}`} title="Remove band" className="grid size-10 place-items-center rounded-lg text-[#747D76] hover:bg-red-50 hover:text-red-700 disabled:opacity-40">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <Button type="button" variant="secondary" onClick={addBand} className="mt-3 min-h-10 gap-2 px-3 text-sm">
            <Plus size={16} /> Add band
          </Button>
        </div>
      </details>

      <details className="rounded-xl border border-[#E3E5E1]">
        <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-[#28332B]">Descriptor table · {descriptors.length} levels</summary>
        <div className="border-t border-[#E3E5E1] p-4">
          <p className="mb-3 text-sm leading-5 text-[#606861]">The descriptor uses the row with the highest minimum Term Grade not exceeding the result.</p>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 border-b border-[#E3E5E1] pb-2 text-xs font-semibold text-[#606861]">
            <span>Term Grade from</span><span>Descriptor</span><span className="sr-only">Remove</span>
          </div>
          {descriptors.map((row, index) => (
            <div key={`${index}-${row.min}`} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 border-b border-[#E3E5E1]/70 py-1.5">
              <input type="number" min="0" max="100" step="1" value={row.min} onChange={(event) => updateDescriptor(index, { min: Number(event.target.value) })} className={inputClass} aria-label={`Descriptor level ${index + 1} minimum`} />
              <input type="text" maxLength={80} value={row.label} onChange={(event) => updateDescriptor(index, { label: event.target.value })} className={inputClass} aria-label={`Descriptor level ${index + 1} label`} />
              <button type="button" onClick={() => setDescriptors((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} disabled={descriptors.length <= 1} aria-label={`Remove descriptor level ${index + 1}`} title="Remove descriptor" className="grid size-10 place-items-center rounded-lg text-[#747D76] hover:bg-red-50 hover:text-red-700 disabled:opacity-40">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={addDescriptor} className="mt-3 min-h-10 gap-2 px-3 text-sm">
            <Plus size={16} /> Add descriptor
          </Button>
        </div>
      </details>

      <FormFooter state={state} pending={pending} label="Save grading rules" />
    </form>
  );
}

export function GradingRulesSettings({ classes, initialClassId }: { classes: GradingClassSetting[]; initialClassId?: string }) {
  const initialId = classes.some((classroom) => classroom.id === initialClassId) ? initialClassId! : classes[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState(initialId);
  const selected = classes.find((classroom) => classroom.id === selectedId);

  if (!classes.length) {
    return <p className="text-sm leading-6 text-[#606861]">Create a classroom before setting its grading rules.</p>;
  }

  return (
    <div className="space-y-5">
      <Select
        name="gradingClass"
        label="Classroom"
        value={selectedId}
        onChange={setSelectedId}
        options={classes.map((classroom) => ({ value: classroom.id, label: `${classroom.name} · ${classroom.subject}` }))}
      />
      {selected ? <GradingRulesForm key={selected.id} classroom={selected} /> : null}
      {selected ? (
        <Link href={`/classes/${selected.id}/term-grades`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#4F6F52]/40 bg-white px-4 text-sm font-semibold text-[#1A4D2E] hover:bg-[#F4F7F4]">
          View calculated term grades
        </Link>
      ) : null}
    </div>
  );
}
