export type AskLearner = {
  id: string;
  name: string;
  average: number | null;
  absences: number | null;
  attendanceRate: number | null;
  change: number | null;
  assessments: { title: string; percentage: number }[];
  missingActivities: string[];
  competencies: { name: string; average: number; classAverage: number }[];
};

export type AskClass = {
  id: string;
  name: string;
  subject: string;
  benchmark: number;
  classAverage: number | null;
  learners: AskLearner[];
  assessmentCount: number;
  assessments: { title: string; average: number; learnerCount: number }[];
  competencies: { name: string; average: number; assessmentCount: number }[];
};

export type AskContext = {
  learnerIds?: string[];
  competencyName?: string;
};

export type AskResultRow = {
  learnerId: string;
  learnerName: string;
  className: string;
  average: number | null;
  benchmark: number;
  absences: number | null;
  attendanceRate: number | null;
  change: number | null;
  missingActivities: string[];
  competency?: { name: string; average: number; classAverage: number };
};

export type AskAnswer = {
  kind: string;
  text: string;
  evidence: string[];
  rows: AskResultRow[];
  context?: AskContext;
  action?: { href: string; label: string };
};

export function findMissingActivityNames(
  learners: { id: string }[],
  scores: { assessmentId: string; assessmentTitle: string; learnerId: string }[],
) {
  const activities = new Map<string, { title: string; learnerIds: Set<string> }>();
  for (const score of scores) {
    const activity = activities.get(score.assessmentId) ?? { title: score.assessmentTitle, learnerIds: new Set<string>() };
    activity.learnerIds.add(score.learnerId);
    activities.set(score.assessmentId, activity);
  }

  const missing = new Map(learners.map((learner) => [learner.id, [] as string[]]));
  for (const activity of activities.values()) {
    for (const learner of learners) {
      if (!activity.learnerIds.has(learner.id)) missing.get(learner.id)?.push(activity.title);
    }
  }
  return missing;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function rowFor(classroom: AskClass, learner: AskLearner, competency?: AskResultRow["competency"]): AskResultRow {
  return {
    learnerId: learner.id,
    learnerName: learner.name,
    className: classroom.name,
    average: learner.average == null ? null : round1(learner.average),
    benchmark: classroom.benchmark,
    absences: learner.absences,
    attendanceRate: learner.attendanceRate == null ? null : round1(learner.attendanceRate),
    change: learner.change == null ? null : round1(learner.change),
    missingActivities: learner.missingActivities,
    competency,
  };
}

function namedRows(classes: AskClass[], eligible: (classroom: AskClass, learner: AskLearner) => boolean) {
  return classes
    .flatMap((classroom) => classroom.learners.filter((learner) => eligible(classroom, learner)).map((learner) => rowFor(classroom, learner)))
    .sort((a, b) => a.learnerName.localeCompare(b.learnerName) || a.className.localeCompare(b.className));
}

function withContext(rows: AskResultRow[], context?: AskContext, question = "") {
  if (!context?.learnerIds?.length || !/\b(those|them|also|only|of them|which of)\b/i.test(question)) return rows;
  const allowed = new Set(context.learnerIds);
  return rows.filter((row) => allowed.has(row.learnerId));
}

function learnerReply(kind: string, rows: AskResultRow[], none: string, evidence: string[], context?: AskContext): AskAnswer {
  const scoped = rows;
  const plural = scoped.length === 1 ? "learner" : "learners";
  const text = scoped.length ? `${scoped.length} ${plural} match${scoped.length === 1 ? "es" : ""}.` : none;
  return { kind, text, evidence, rows: scoped, context: { ...context, learnerIds: scoped.map((row) => row.learnerId) } };
}

export function answerQuestion(
  rawQuestion: string,
  classes: AskClass[],
  options: { absenceThreshold: number; context?: AskContext },
): AskAnswer {
  const question = rawQuestion.trim();
  const lower = question.toLocaleLowerCase();
  const context = options.context;

  if (classes.length === 0) {
    return { kind: "empty", text: "There are no active classrooms to search yet.", evidence: [], rows: [] };
  }

  const learnerEntries = classes.flatMap((classroom) => classroom.learners.map((learner) => ({ classroom, learner })));
  const exactLearners = learnerEntries.filter(({ learner }) => lower.includes(learner.name.toLocaleLowerCase()));
  const partialLearners = learnerEntries.filter(({ learner }) =>
    learner.name.split(/\s+/).some((part) => part.length >= 3 && lower.includes(part.toLocaleLowerCase())),
  );
  const matchedLearner = exactLearners[0] ?? (partialLearners.length === 1 ? partialLearners[0] : undefined);

  if (matchedLearner && /\b(summari[sz]e|progress|why|about|tell me|how is|how's)\b/i.test(question)) {
    const { classroom, learner } = matchedLearner;
    const row = rowFor(classroom, learner);
    const facts = [
      learner.average == null ? "No confirmed average yet." : `Average ${round1(learner.average)}% against the ${classroom.benchmark}% benchmark.`,
      learner.change == null ? "Not enough assessments to compare progress." : `Latest assessment is ${round1(Math.abs(learner.change))} percentage points ${learner.change > 0 ? "above" : learner.change < 0 ? "below" : "equal to"} the earlier-assessment average.`,
      learner.absences == null ? "No attendance has been recorded." : `${learner.absences} recorded absences.`,
      learner.attendanceRate == null ? "No attendance rate can be calculated yet." : `${round1(learner.attendanceRate)}% recorded attendance.`,
      learner.missingActivities.length ? `No confirmed score for ${learner.missingActivities.join(", ")}.` : "No unscored completed activity found.",
    ];
    const competencyEvidence = learner.competencies.map((item) => `${item.name}: ${round1(item.average)}% (class ${round1(item.classAverage)}%).`);
    return {
      kind: "learner-lookup",
      text: `${learner.name} in ${classroom.name}: ${facts.join(" ")}`,
      evidence: [`${learner.assessments.length} confirmed assessment${learner.assessments.length === 1 ? "" : "s"}.`, ...learner.assessments.map((item) => `${item.title}: ${round1(item.percentage)}%.`), ...competencyEvidence],
      rows: [row],
      context: { learnerIds: [learner.id] },
    };
  }

  if (/\b(weakest|lowest)\b.*\bcompetenc|\bcompetenc\w*\b.*\b(weakest|lowest)\b/i.test(question)) {
    const ranked = classes.flatMap((classroom) =>
      classroom.competencies.map((competency) => ({ ...competency, className: classroom.name, classId: classroom.id })),
    ).sort((a, b) => a.average - b.average || a.name.localeCompare(b.name));
    const weakest = ranked[0];
    if (!weakest) {
      return { kind: "competency", text: "No confirmed competency results are available yet. Competencies need to be mapped to checked assessment items.", evidence: ["Only teacher-confirmed competency mappings and confirmed scores are included."], rows: [] };
    }
    return {
      kind: "competency",
      text: `${weakest.name} has the lowest recorded average at ${round1(weakest.average)}% in ${weakest.className}.`,
      evidence: [`${weakest.assessmentCount} assessment${weakest.assessmentCount === 1 ? "" : "s"} with confirmed mapped scores.`, "Only teacher-confirmed competency mappings and confirmed scores are included."],
      rows: [],
      context: { competencyName: weakest.name },
    };
  }

  if (context?.competencyName && /\b(who|which learners?|students?|struggling|below|weak)\b/i.test(question) && /\b(it|that|them|learners?|students?)\b/i.test(question)) {
    const rows = classes.flatMap((classroom) => classroom.learners.flatMap((learner) => {
      const competency = learner.competencies.find((item) => item.name.toLocaleLowerCase() === context.competencyName?.toLocaleLowerCase());
      if (!competency || competency.average >= competency.classAverage) return [];
      return [rowFor(classroom, learner, competency)];
    })).sort((a, b) => (a.competency?.average ?? 101) - (b.competency?.average ?? 101) || a.learnerName.localeCompare(b.learnerName));
    return learnerReply(
      "competency-learners",
      rows,
      `No learners scored below the class average in ${context.competencyName}.`,
      [`Compared each learner's confirmed ${context.competencyName} score with the class average for that competency.`],
      context,
    );
  }

  if (/\b(lowest|weakest)\b.*\b(assessment|activity|test|exam)\b|\b(assessment|activity|test|exam)\b.*\b(lowest|weakest)\b/i.test(question)) {
    const ranked = classes.flatMap((classroom) => classroom.assessments.map((assessment) => ({ ...assessment, className: classroom.name })))
      .sort((a, b) => a.average - b.average || a.title.localeCompare(b.title));
    const lowest = ranked[0];
    if (!lowest) return { kind: "assessment", text: "No confirmed assessment scores are available yet.", evidence: ["Only assessments with confirmed scores are included."], rows: [] };
    return {
      kind: "assessment",
      text: `${lowest.title} has the lowest recorded average at ${round1(lowest.average)}% in ${lowest.className}.`,
      evidence: [`Calculated as the mean of each learner's score divided by that assessment's possible points.`, `${lowest.learnerCount} learner${lowest.learnerCount === 1 ? "" : "s"} with confirmed scores.`],
      rows: [],
    };
  }

  if (/\b(generate|prepare|create|write)\b.*\breport\b|\breport\b.*\b(generate|prepare|create)\b/i.test(question)) {
    return {
      kind: "report",
      text: "TeacherCo’s report builder can prepare a class-performance or learner-progress report from confirmed records.",
      evidence: ["Reports use the same verified scores, attendance records, and teacher-confirmed competency mappings."],
      rows: [],
      action: { href: "/reports", label: "Open Reports" },
    };
  }

  const explicitBenchmark = question.match(/\b(?:below|under|less than)\s+(\d+(?:\.\d+)?)\s*%?/i);
  const belowRequested = Boolean(explicitBenchmark) || /\b(below|under benchmark|low grades?|low scores?|at risk)\b/i.test(question);
  const absenceMatch = question.match(/\b(?:at least|more than|over)?\s*(\d+)\s*(?:or more\s*)?(?:recorded\s*)?absences?\b/i);
  const absenceRequested = Boolean(absenceMatch) || /\b(absent|absences?|frequent absences?|attendance concerns?)\b/i.test(question);
  const goodAttendance = /\b(good|strong|regular) attendance\b|\bhigh attendance\b/i.test(question);
  const missingRequested = /\b(missing|no recorded score|unscored|incomplete)\b.*\b(activity|activities|work|assessment|assessments|score|scores)?\b|\b(missing activities|missing work)\b/i.test(question);
  const refinementRows = /\b(those|them|also|only|of them|which of)\b/i.test(question);

  if (/\b(upload|import|class record|previous version)\b.*\b(chang|previous|last|since|compare)|\bwhat changed since\b/i.test(question)) {
    return {
      kind: "import-history",
      text: "A verified comparison with the previous upload isn’t available for this question yet. TeacherCo won’t guess what changed.",
      evidence: ["This workspace does not currently expose a complete, queryable import-history record for Ask."],
      rows: [],
    };
  }

  if (belowRequested || absenceRequested || goodAttendance) {
    const benchmark = explicitBenchmark ? Number(explicitBenchmark[1]) : null;
    const absenceLimit = absenceMatch ? Number(absenceMatch[1]) : options.absenceThreshold;
    let rows = namedRows(classes, (classroom, learner) => {
      const below = learner.average != null && learner.average < (benchmark ?? classroom.benchmark);
      const frequentAbsences = learner.absences != null && learner.absences >= absenceLimit;
      const enoughAttendanceData = learner.attendanceRate != null;
      const attendanceGood = enoughAttendanceData && learner.attendanceRate! >= 80;
      if (belowRequested && absenceRequested) return below && frequentAbsences;
      if (belowRequested && goodAttendance) return below && attendanceGood;
      if (belowRequested) return below;
      if (goodAttendance && !absenceRequested) return attendanceGood;
      return frequentAbsences;
    });
    if (refinementRows) rows = withContext(rows, context, question);
    const conditions = [
      belowRequested ? `below ${benchmark ?? "the class"} benchmark` : "",
      absenceRequested ? `${absenceLimit} or more recorded absences` : "",
      goodAttendance ? "at least 80% recorded attendance" : "",
    ].filter(Boolean).join(" and ");
    const resultKind = belowRequested && absenceRequested
      ? "grade-absences"
      : belowRequested && goodAttendance
        ? "grade-attendance"
        : belowRequested
          ? "benchmark"
          : goodAttendance
            ? "good-attendance"
            : "absences";
    return learnerReply(
      resultKind,
      rows,
      `No learners match ${conditions}.`,
      [`Learner averages are calculated from confirmed assessment scores.`, `Absence counts use recorded absent marks${absenceRequested ? `; threshold: ${absenceLimit}` : ""}.`, ...(goodAttendance ? ["Attendance rate counts present and late as here, excludes excused marks, and requires recorded attendance data."] : [])],
      context,
    );
  }

  if (missingRequested) {
    let rows = namedRows(classes, (_classroom, learner) => learner.missingActivities.length > 0)
      .map((row) => ({ ...row, missingActivities: [...row.missingActivities] }));
    if (refinementRows) rows = withContext(rows, context, question);
    return learnerReply(
      "missing-activities",
      rows,
      "No unscored activities were found in the completed records available.",
      ["An activity is listed only when it has confirmed class scores but this learner has no confirmed score recorded for it.", "This does not infer due dates or teacher-assigned work."],
      context,
    );
  }

  if (/\b(improved|improve|declined|decline|dropped|drop|increased|increase|who changed)\b/i.test(question)) {
    const improving = /\b(improved|improve|increased|increase)\b/i.test(question) && !/\bdeclined|dropped|drop\b/i.test(question);
    let rows = namedRows(classes, (_classroom, learner) => learner.change != null && (improving ? learner.change > 0 : learner.change < 0))
      .sort((a, b) => (improving ? (b.change ?? -Infinity) - (a.change ?? -Infinity) : (a.change ?? Infinity) - (b.change ?? Infinity)));
    if (refinementRows) rows = withContext(rows, context, question);
    return learnerReply(
      "progress",
      rows,
      "There are no comparable confirmed assessments to show that change yet.",
      ["Change compares the latest confirmed assessment percentage with the average of the learner's earlier confirmed assessments."],
      context,
    );
  }

  if (/\bclass average\b|\baverage of (the )?class(?:room)?s?\b|\baverage grade\b|\blowest\b.*\bclass\b|\bclass\b.*\blowest\b.*\baverage\b/i.test(question)) {
    const ranked = [...classes].sort((a, b) => (a.classAverage ?? Infinity) - (b.classAverage ?? Infinity));
    const rows = ranked.flatMap((classroom) => classroom.classAverage == null ? [] : [{
      learnerId: classroom.id,
      learnerName: classroom.name,
      className: classroom.name,
      average: round1(classroom.classAverage),
      benchmark: classroom.benchmark,
      absences: null,
      attendanceRate: null,
      change: null,
      missingActivities: [],
    }]);
    const available = ranked.filter((classroom) => classroom.classAverage != null);
    const acrossClasses = classes.length > 1;
    const lowestClass = /\blowest\b/.test(lower);
    const text = !available.length
      ? "No confirmed scores are available to calculate an average."
      : acrossClasses && lowestClass
        ? `${available[0]?.name} has the lowest class average at ${round1(available[0]?.classAverage ?? 0)}%.`
        : acrossClasses
          ? available.map((classroom) => `${classroom.name}: ${round1(classroom.classAverage ?? 0)}%`).join(" · ")
          : `The class average is ${round1(available[0]?.classAverage ?? 0)}%.`;
    return { kind: "class-average", text, evidence: ["Calculated from confirmed scores as the mean of each score divided by its possible points.", ...available.map((classroom) => `${classroom.name}: ${classroom.benchmark}% benchmark.`)], rows };
  }

  if (/\b(what should i know|summari[sz]e|explain|class summary|about (this|the) class)\b/i.test(question)) {
    const evidence = classes.map((classroom) => ({
      className: classroom.name,
      classAverage: classroom.classAverage,
      benchmark: classroom.benchmark,
      scoredLearners: classroom.learners.filter((learner) => learner.average != null).length,
      below: classroom.learners.filter((learner) => learner.average != null && learner.average < classroom.benchmark).length,
      competencies: classroom.competencies.slice(0, 3),
      assessmentCount: classroom.assessmentCount,
    }));
    const text = evidence.map((item) => {
      const average = item.classAverage == null ? "No confirmed class average yet" : `Class average ${round1(item.classAverage)}%`;
      const weakest = item.competencies[0] ? `Weakest mapped competency: ${item.competencies[0].name} (${round1(item.competencies[0].average)}%).` : "No confirmed competency mappings yet.";
      const below = item.scoredLearners ? `${item.below} of ${item.scoredLearners} learners with scores below the ${item.benchmark}% benchmark.` : "No learners have confirmed scores yet.";
      return `${item.className}: ${average}; ${below} ${weakest}`;
    }).join("\n");
    return { kind: "summary", text, evidence: ["This is a facts-only summary calculated from confirmed scores, teacher-confirmed competency mappings, and the class benchmark.", "AI explanations are not available until an AI provider is configured."], rows: [] };
  }

  if (matchedLearner) {
    const { classroom, learner } = matchedLearner;
    const row = rowFor(classroom, learner);
    const score = learner.average == null ? "No confirmed average yet" : `Average ${round1(learner.average)}% (benchmark ${classroom.benchmark}%).`;
    return {
      kind: "learner-lookup",
      text: `${learner.name} in ${classroom.name}: ${score} ${learner.absences == null ? "No attendance has been recorded." : `${learner.absences} recorded absences.`}`,
      evidence: [`${learner.assessments.length} confirmed assessment${learner.assessments.length === 1 ? "" : "s"}.`, "Attendance counts include only recorded attendance entries."],
      rows: [row],
      context: { learnerIds: [learner.id] },
    };
  }

  return {
    kind: "unsupported",
    text: "I can answer questions from classroom records, such as who is below the benchmark, attendance concerns, missing recorded scores, class averages, progress, assessments, and mapped competencies. I can’t answer general-knowledge questions.",
    evidence: [],
    rows: [],
  };
}