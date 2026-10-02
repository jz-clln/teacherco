// src/features/reports/evidence-view.tsx

import { Card } from "@/components/ui/card";
import type { GenerationMeta } from "@/lib/ai/report-narrative";
import type { ClassReportEvidence, LearnerReportEvidence } from "@/lib/evidence/reports";
import { fmtChange, fmtDate, fmtPct, flagLabels } from "./format";

export type StoredEvidence = (ClassReportEvidence | LearnerReportEvidence) & { generation: GenerationMeta };

const headCell = "px-5 py-2.5 font-medium";
const headRow = "bg-[#F5F6F4] text-xs uppercase tracking-wide text-[#606861]";

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <p className="text-sm text-[#606861]">{label}</p>
      <p className="mt-2 text-2xl font-bold text-[#1E2420]">{value}</p>
      {note ? <p className="mt-1 text-xs leading-5 text-[#8B928C]">{note}</p> : null}
    </Card>
  );
}

function TableCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-[#E3E5E1] px-5 py-4">
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </Card>
  );
}

function ClassEvidenceView({ e }: { e: ClassReportEvidence }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Class average" value={fmtPct(e.classAverage)} note="Mean of every confirmed score, each as a percentage." />
        <Stat label="Learners with scores" value={`${e.scoredLearnerCount} of ${e.learnerCount}`} note={`${e.assessmentCount} assessment${e.assessmentCount === 1 ? "" : "s"} included`} />
        <Stat label={`Below ${e.benchmark}%`} value={String(e.belowBenchmarkCount)} note="Learners whose own average is under the benchmark." />
        <Stat
          label={`${e.thresholds.absences}+ absences`}
          value={e.attendanceConcernCount == null ? "No records" : String(e.attendanceConcernCount)}
          note="Your absence rule from Settings."
        />
        <Stat label={`Dropped ${e.thresholds.dropPoints}+ pts`} value={String(e.dropCount)} note="Latest assessment versus earlier average." />
      </div>

      <TableCard title="Competencies">
        {e.competencies.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[#606861]">No confirmed competencies are mapped to scored questions yet.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className={headRow}>
                <th className={headCell}>Competency</th>
                <th className={headCell}>Average</th>
                <th className={headCell}>Assessments</th>
                <th className={headCell}>Below benchmark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E5E1]">
              {e.competencies.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-3 font-medium">{c.name}</td>
                  <td className="px-5 py-3">{fmtPct(c.average)}</td>
                  <td className="px-5 py-3 text-[#606861]">{c.assessmentCount}</td>
                  <td className="px-5 py-3 text-[#606861]">
                    {c.belowBenchmarkCount} of {c.learnerCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>

      <TableCard title="Learners">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className={headRow}>
              <th className={headCell}>Name</th>
              <th className={headCell}>Average</th>
              <th className={headCell}>Absences</th>
              <th className={headCell}>Latest change</th>
              <th className={headCell}>Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E3E5E1]">
            {e.learners.map((l) => (
              <tr key={l.id}>
                <td className="px-5 py-3 font-medium">{l.name}</td>
                <td className="px-5 py-3">{fmtPct(l.average)}</td>
                <td className="px-5 py-3 text-[#606861]">{l.absences ?? "—"}</td>
                <td className="px-5 py-3 text-[#606861]">{fmtChange(l.change)}</td>
                <td className="px-5 py-3">
                  {l.flags.length === 0
                    ? "—"
                    : l.flags.map((flag) => (
                        <span key={flag} className="mr-1.5 inline-block rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                          {flagLabels[flag]}
                        </span>
                      ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
    </div>
  );
}

function LearnerEvidenceView({ e }: { e: LearnerReportEvidence }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Learner average" value={fmtPct(e.average)} note={e.belowBenchmark ? `Below the ${e.benchmark}% benchmark` : `At or above the ${e.benchmark}% benchmark`} />
        <Stat label="Class average" value={fmtPct(e.classAverage)} />
        <Stat label="Latest change" value={fmtChange(e.change)} note="Latest assessment versus the average of earlier ones." />
        <Stat
          label="Recorded absences"
          value={e.absences == null ? "No records" : String(e.absences)}
          note={e.attendance ? `${e.attendance.late} late · ${e.attendance.excused} excused` : undefined}
        />
      </div>

      <TableCard title="Assessments">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className={headRow}>
              <th className={headCell}>Assessment</th>
              <th className={headCell}>Score</th>
              <th className={headCell}>Percentage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E3E5E1]">
            {e.assessments.map((a, index) => (
              <tr key={`${a.title}-${index}`}>
                <td className="px-5 py-3 font-medium">{a.title}</td>
                <td className="px-5 py-3 text-[#606861]">
                  {a.earned} / {a.possible}
                </td>
                <td className="px-5 py-3">{fmtPct(a.percentage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <TableCard title="Competencies">
        {e.competencies.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[#606861]">No confirmed competencies are mapped to this learner scored questions yet.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className={headRow}>
                <th className={headCell}>Competency</th>
                <th className={headCell}>Learner</th>
                <th className={headCell}>Class</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E5E1]">
              {e.competencies.map((c) => (
                <tr key={c.name}>
                  <td className="px-5 py-3 font-medium">{c.name}</td>
                  <td className="px-5 py-3">{fmtPct(c.average)}</td>
                  <td className="px-5 py-3 text-[#606861]">{fmtPct(c.classAverage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
    </div>
  );
}

export function EvidenceView({ evidence }: { evidence: StoredEvidence }) {
  return (
    <div className="space-y-4">
      {evidence.kind === "class_performance" ? <ClassEvidenceView e={evidence} /> : <LearnerEvidenceView e={evidence} />}
      <p className="text-xs leading-5 text-[#8B928C]">
        These numbers come from the confirmed scores in your TeacherCo records as of {fmtDate(evidence.generation.generatedAt)}, and were
        calculated by TeacherCo, not by AI. Benchmark used: {evidence.benchmark}%. Regenerate the report after new scores are confirmed to
        refresh them.
      </p>
    </div>
  );
}