/**
 * The Tutor's rules that hold whatever the model does.
 *
 * TEACHING NOTE — the same shape as `assistantPolicy.ts` and, in the API repo,
 * `src/lib/citations.ts`. The model is asked to cite only lab ids from the
 * corpus, to write quiz items with a valid answer, and to mark an attempt
 * "revise" when it misses a criterion. A prompt is advice. What holds is that
 * this file:
 *
 *   1. drops any lab id the corpus does not contain — a learner told to "re-read
 *      lab-11" follows a 404 and concludes the course is broken;
 *   2. drops quiz items whose answer index points at no option — a drill with
 *      no right answer teaches the learner that they are wrong;
 *   3. forces the session count to what the learner confirmed, and clamps
 *      minutes to it — the scope was agreed before the call, not by the model;
 *   4. downgrades a "pass" with an unmet rubric criterion to "revise" — the
 *      verdict is derived from the rubric, not asserted alongside it — and
 *      builds that rubric from the deliverable's parts, one criterion per
 *      part, so the review cannot grade something the learner was never
 *      asked for;
 *   5. sets a hint's level from how many came before it, not from the model —
 *      the third hint is the strongest one whatever the model thought it wrote,
 *      and there is no fourth;
 *   6. keeps a starter only if every defect in it is an authored mistake from
 *      the session's labs whose line is really in the code, and tells the
 *      review which planted lines are still in the attempt. It does NOT fail
 *      those criteria by itself: a correct fix can leave a planted line behind,
 *      unused, and a substring check cannot tell dead code from a live bug.
 *      That judgement is the model's, pointed at the exact line.
 *
 * Deliberately free of imports so it can be unit-tested from the root package
 * without Next, `server-only`, or the SDK. The website hand-mirrors the types
 * below in `website/src/components/Tutor/types.ts`; change both.
 */

export const TUTOR_LIMITS = {
  maxDays: 30,
  maxSessionsPerDay: 3,
  maxSessions: 14,
  minMinutes: 10,
  maxMinutes: 90,
  maxDrill: 10,
  authoredPerLesson: 4,
  maxAttemptChars: 6_000,
  /** Nudge, pointer, partial step. Past that the review is the better teacher. */
  maxHints: 3,
  maxQuestionChars: 500,
  /** Planted mistakes per starter. One is a bug hunt; three is a rewrite. */
  maxDefects: 2,
} as const;

/**
 * Field ceilings for model output the browser later sends BACK. The lesson and
 * review routes re-validate what the page echoes, because nothing is stored
 * here; if these rules let through a title the lesson route then rejects, the
 * learner's saved plan cannot start a session. So the routes and the
 * validators below read the same numbers.
 */
export const TUTOR_FIELDS = {
  title: 160,
  labIds: 4,
  objective: 240,
  objectives: 6,
  whyNow: 400,
  prompt: 4_000,
  /** Room for a format and five numbered parts; see composeExercise. */
  deliverable: 700,
  rubricItem: 300,
  rubric: 8,
  hint: 1_500,
  lookFor: 160,
  /** Well under maxAttemptChars, so a learner can fix a starter without deleting to make room. */
  starterCode: 3_000,
  /** Mocks for volume and rate limits cost lines: a live Lab 9 starter reached 53 of the old 60. */
  starterLines: 80,
  mistakeId: 60,
} as const;

/** Trimmed and cut to fit, so a route's `.trim().max(n)` accepts it. */
const fit = (text: string, max: number) => text.trim().slice(0, max).trim();

/** Non-empty items only, each cut to fit, list cut to its ceiling. */
const fitList = (items: readonly string[], maxItem: number, maxItems: number) =>
  items.map((i) => fit(i, maxItem)).filter(Boolean).slice(0, maxItems);

export type Level = "new" | "some" | "shipped";

export interface Intake {
  days: number;
  sessionsPerDay: number;
  minutesPerSession: number;
  level: Level;
  /** Corpus ids to concentrate on. Empty means the whole corpus. */
  focus: string[];
}

export interface QuizItem {
  question: string;
  options: string[];
  answer: number;
  explain: string;
  note?: string;
}

/**
 * A mistake an author has seen learners make, written as a ```mistake block in
 * the lab that teaches it. It is the raw material for an exercise's starter
 * code: the Tutor may plant `wrong` and grade against `right`, but it does not
 * get to invent what counts as a mistake.
 *
 * Two rules for writing `wrong`, both learned from live lessons:
 *
 *   - Portable. It must read naturally in a short script, not only inside the
 *     route it came from. `if (validated.data.within_agent_authority) return
 *     c.json(...)` only fits the Hono route, so a starter written as a script
 *     rewrote it, the rewrite failed the substring check, and the bug went
 *     ungraded. `if (resolution.within_agent_authority) {` fits anywhere.
 *   - Gone after any correct fix. The review fails a criterion while this
 *     line is in the attempt, so it must be a line every correct fix changes
 *     or removes. `console.error(...)` in a catch block survives a fix that
 *     adds `send("error", ...)` after it; the whole one-line catch does not.
 */
export interface MistakeItem {
  /** Kebab-case, unique across the whole corpus. */
  id: string;
  /** The one line a starter plants. One line, so "is it still there?" is a substring check. */
  wrong: string;
  /** The fix. May span lines. */
  right: string;
  /** What the learner sees when they run it. Often: nothing is wrong, yet. */
  symptom: string;
  /** Why it is wrong, in one or two sentences. */
  why: string;
}

export const MISTAKE_FIELDS = { wrong: 160 } as const;

/** Why a mistake item is unusable, or null if it is fine. Shared by the sync and the tests. */
export function mistakeProblem(item: Partial<MistakeItem>): string | null {
  for (const key of ["id", "wrong", "right", "symptom", "why"] as const) {
    if (typeof item[key] !== "string" || !item[key].trim()) return `needs a non-empty "${key}"`;
  }
  const { id, wrong, right } = item as MistakeItem;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) return `id "${id}" is not kebab-case`;
  if (wrong.includes("\n")) return `"wrong" must be one line`;
  if (wrong.length > MISTAKE_FIELDS.wrong) return `"wrong" is over ${MISTAKE_FIELDS.wrong} characters`;
  // A fix that still contains the planted line would read as unfixed forever.
  if (right.includes(wrong.trim())) return `"right" still contains the "wrong" line`;
  return null;
}

export interface DrillItem extends QuizItem {
  labId: string;
  source: "authored" | "generated";
}

export interface PlanSession {
  n: number;
  title: string;
  minutes: number;
  day: number;
  labIds: string[];
  objectives: string[];
  whyNow: string;
}

export interface Plan {
  goal: string;
  doneMeans: string[];
  /** What the learner asked for that the corpus does not cover. Said, not filled. */
  gaps: string[];
  sessions: PlanSession[];
}

/** One planted mistake: which authored item, and which rubric criterion fixing it satisfies. */
export interface StarterDefect {
  mistakeId: string;
  /** Zero-based index into `exercise.rubric`. */
  criterion: number;
}

/**
 * Code the exercise editor opens with. It runs; it is wrong in the ways
 * `defects` name. The page holds the ids, not the mistakes' text — the server
 * looks those up from the corpus, so an echoed id can only select an authored
 * mistake, never supply one.
 */
export interface Starter {
  code: string;
  defects: StarterDefect[];
}

export interface Lesson {
  sessionN: number;
  title: string;
  brief: { point: string; labId: string }[];
  drill: DrillItem[];
  exercise: { prompt: string; deliverable: string; rubric: string[] };
  /** Null when the exercise starts blank. Absent on lessons saved before starters existed. */
  starter?: Starter | null;
}

/**
 * An exercise as the model writes it: what to submit, in parts, each with the
 * one check that grades it. `composeExercise` turns this into the deliverable
 * and rubric the page shows, so the two cannot disagree.
 */
export interface ExerciseDraft {
  prompt: string;
  /** The form of the submission, e.g. "Two or three sentences". */
  format: string;
  parts: { ask: string; criterion: string }[];
}

/**
 * "missing": the attempt does not address the criterion. "incorrect": it does,
 * and gets it wrong. A learner who left something out is closer than one who
 * got it wrong, and the review should say which.
 */
export type Gap = "missing" | "incorrect";

export interface Review {
  verdict: "pass" | "revise";
  /** What the attempt already gets right, to the learner. Empty when nothing is. */
  rightSoFar: string;
  rubric: { criterion: string; met: boolean; gap: Gap | null; note: string }[];
  fixes: { issue: string; why: string; labRef: string | null }[];
  beforeNextLesson: string;
}

/** 1 nudge (the idea), 2 pointer (the field or method), 3 step (the shape of one piece). */
export type HintLevel = 1 | 2 | 3;

export interface Hint {
  level: HintLevel;
  text: string;
  labRef: string | null;
  /** A heading or phrase to find in `labRef`, so the link lands somewhere useful. */
  lookFor: string | null;
}

/** A corpus entry, as much of one as these rules need. */
export interface CorpusDoc {
  id: string;
  quizzes: QuizItem[];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

/** The one number the learner confirms before anything is generated. */
export function sessionCount(intake: Pick<Intake, "days" | "sessionsPerDay">): number {
  return clamp(intake.days * intake.sessionsPerDay, 1, TUTOR_LIMITS.maxSessions);
}

export function validQuizItem(item: QuizItem): boolean {
  return (
    item.question.trim().length > 0 &&
    item.options.length >= 2 &&
    Number.isInteger(item.answer) &&
    item.answer >= 0 &&
    item.answer < item.options.length
  );
}

export function validatePlan(
  plan: Plan,
  known: ReadonlySet<string>,
  intake: Intake,
): { plan: Plan; dropped: string[] } {
  const dropped: string[] = [];
  const target = sessionCount(intake);
  const minutes = clamp(intake.minutesPerSession, TUTOR_LIMITS.minMinutes, TUTOR_LIMITS.maxMinutes);

  const sessions = plan.sessions
    .map((s) => {
      const labIds = s.labIds.filter((id) => {
        if (known.has(id)) return true;
        dropped.push(id);
        return false;
      });
      return {
        ...s,
        labIds: labIds.slice(0, TUTOR_FIELDS.labIds),
        objectives: fitList(s.objectives, TUTOR_FIELDS.objective, TUTOR_FIELDS.objectives),
        whyNow: fit(s.whyNow, TUTOR_FIELDS.whyNow),
      };
    })
    // A session that cites nothing real has nothing real to teach.
    .filter((s) => s.labIds.length > 0)
    .slice(0, target)
    .map((s, i) => ({
      ...s,
      title: fit(s.title, TUTOR_FIELDS.title) || `Session ${i + 1}`,
      n: i + 1,
      minutes,
      day: clamp(Math.floor(i / intake.sessionsPerDay) + 1, 1, intake.days),
    }));

  return { plan: { ...plan, sessions }, dropped };
}

/**
 * Authored items first, because an author wrote and the site build checked
 * them. Generated items fill the rest; duplicates by question text are dropped.
 */
export function assembleDrill(
  corpus: readonly CorpusDoc[],
  labIds: readonly string[],
  generated: readonly DrillItem[],
  known: ReadonlySet<string>,
): { drill: DrillItem[]; dropped: number } {
  const authored: DrillItem[] = corpus
    .filter((doc) => labIds.includes(doc.id))
    .flatMap((doc) => doc.quizzes.map((q) => ({ ...q, labId: doc.id, source: "authored" as const })))
    .slice(0, TUTOR_LIMITS.authoredPerLesson);

  let dropped = 0;
  const seen = new Set<string>();
  const drill: DrillItem[] = [];
  for (const item of [...authored, ...generated.map((g) => ({ ...g, source: "generated" as const }))]) {
    const key = item.question.trim().toLowerCase();
    if (!validQuizItem(item) || !known.has(item.labId) || seen.has(key)) {
      if (item.source === "generated") dropped++;
      continue;
    }
    seen.add(key);
    drill.push(item);
  }
  return { drill: drill.slice(0, TUTOR_LIMITS.maxDrill), dropped };
}

export function validateLesson(
  lesson: Omit<Lesson, "drill">,
  known: ReadonlySet<string>,
  /** The authored mistakes from this session's labs: the only ones a starter may plant. */
  mistakes: readonly MistakeItem[] = [],
): { lesson: Omit<Lesson, "drill">; dropped: string[] } {
  const dropped: string[] = [];
  const brief = lesson.brief.filter((b) => {
    if (known.has(b.labId)) return true;
    dropped.push(b.labId);
    return false;
  });
  const rubric = fitList(lesson.exercise.rubric, TUTOR_FIELDS.rubricItem, TUTOR_FIELDS.rubric);
  const exercise = {
    prompt: fit(lesson.exercise.prompt, TUTOR_FIELDS.prompt),
    deliverable: fit(lesson.exercise.deliverable, TUTOR_FIELDS.deliverable) || "Your answer to the exercise above.",
    // The review route needs at least one criterion to grade against.
    rubric: rubric.length ? rubric : ["Answers the exercise correctly, using only what the course teaches."],
  };
  const starter = validateStarter(lesson.starter ?? null, mistakes, exercise.rubric.length, dropped);
  return {
    lesson: {
      ...lesson,
      title: fit(lesson.title, TUTOR_FIELDS.title) || `Session ${lesson.sessionN}`,
      brief,
      exercise,
      starter,
    },
    dropped,
  };
}

/**
 * A starter is only worth opening with if its bugs are the ones it claims. So
 * each defect must name an allowed mistake, point at a real criterion, and
 * have its `wrong` line actually in the code. A starter left with no defects is
 * dropped whole: correct code with nothing to fix is a worked answer.
 *
 * The code is never cut to fit. Truncating it could remove a planted line or
 * leave it unparseable, so an oversized starter is dropped instead.
 */
function validateStarter(
  starter: Starter | null,
  mistakes: readonly MistakeItem[],
  rubricLength: number,
  dropped: string[],
): Starter | null {
  if (!starter) return null;
  const code = starter.code.replace(/\s+$/, "");
  if (!code.trim() || code.length > TUTOR_FIELDS.starterCode || code.split("\n").length > TUTOR_FIELDS.starterLines) {
    dropped.push("starter (empty or too long)");
    return null;
  }
  const byId = new Map(mistakes.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const defects: StarterDefect[] = [];
  for (const d of starter.defects) {
    const mistake = byId.get(d.mistakeId);
    const ok =
      mistake &&
      !seen.has(d.mistakeId) &&
      Number.isInteger(d.criterion) &&
      d.criterion >= 0 &&
      d.criterion < rubricLength &&
      code.includes(mistake.wrong.trim());
    if (!ok) {
      dropped.push(`starter defect ${d.mistakeId}`);
      continue;
    }
    seen.add(d.mistakeId);
    defects.push({ mistakeId: d.mistakeId, criterion: d.criterion });
  }
  if (defects.length === 0) {
    dropped.push("starter (no verifiable defect)");
    return null;
  }
  return { code, defects: defects.slice(0, TUTOR_LIMITS.maxDefects) };
}

/**
 * Turns defects the page echoed back into the authored mistakes they name,
 * dropping any id the corpus does not have or criterion the rubric does not.
 */
/**
 * What `validateLesson` dropped from the starter. A dropped defect may leave its bug in the code with nothing tracking
 * it; a dropped starter leaves a prompt written around code the learner will not get. Either is worth a second draft.
 * Reads the reasons `validateStarter` writes, in this file.
 */
export function starterDrops(dropped: readonly string[]): { defects: number; whole: boolean } {
  return {
    defects: dropped.filter((d) => d.startsWith("starter defect ")).length,
    whole: dropped.some((d) => d.startsWith("starter (")),
  };
}

export function resolveDefects(
  defects: readonly StarterDefect[],
  catalog: ReadonlyMap<string, MistakeItem>,
  rubricLength: number,
): (MistakeItem & { criterion: number })[] {
  return defects.flatMap((d) => {
    const mistake = catalog.get(d.mistakeId);
    return mistake && d.criterion >= 0 && d.criterion < rubricLength ? [{ ...mistake, criterion: d.criterion }] : [];
  });
}

/** The planted mistakes whose line is still in the text. A substring check, which is why `wrong` is one line. */
export function unfixed<M extends Pick<MistakeItem, "wrong">>(planted: readonly M[], attempt: string): M[] {
  return planted.filter((m) => attempt.includes(m.wrong.trim()));
}

export function validateReview(review: Review, known: ReadonlySet<string>): Review {
  const rubric = review.rubric.map((r) => ({
    ...r,
    // A met criterion has no gap; an unmet one without a stated gap was at least not addressed.
    gap: r.met ? null : (r.gap ?? "missing"),
  }));
  const anyMissed = rubric.some((r) => !r.met);
  return {
    ...review,
    rightSoFar: review.rightSoFar.trim(),
    rubric,
    verdict: anyMissed ? "revise" : review.verdict,
    fixes: review.fixes.map((f) => ({ ...f, labRef: f.labRef && known.has(f.labRef) ? f.labRef : null })),
  };
}

/**
 * The deliverable and the rubric, built from the same list. Part n of the
 * deliverable is criterion n of the rubric, so every check the review makes is
 * something the learner was told to submit.
 *
 * If the numbered deliverable will not fit the field the routes accept, parts
 * are dropped from the end — from both lists together. Cutting the text
 * instead would leave a criterion grading a part the learner cannot see.
 */
export function composeExercise(draft: ExerciseDraft): {
  exercise: Lesson["exercise"];
  droppedParts: number;
} {
  const parts = draft.parts
    .map((p) => ({ ask: p.ask.trim().replace(/[.;]+$/, ""), criterion: fit(p.criterion, TUTOR_FIELDS.rubricItem) }))
    .filter((p) => p.ask && p.criterion);
  const format = draft.format.trim().replace(/[.:]+$/, "");
  const deliverableFor = (ps: typeof parts) => {
    const list = ps.length === 1 ? ps[0]!.ask : ps.map((p, i) => `(${i + 1}) ${p.ask}`).join("; ");
    return format ? `${format}: ${list}.` : `${list}.`;
  };

  let kept = parts.slice(0, TUTOR_FIELDS.rubric);
  while (kept.length > 1 && deliverableFor(kept).length > TUTOR_FIELDS.deliverable) kept = kept.slice(0, -1);
  return {
    exercise: {
      prompt: draft.prompt,
      deliverable: kept.length ? deliverableFor(kept) : "",
      rubric: kept.map((p) => p.criterion),
    },
    droppedParts: draft.parts.length - kept.length,
  };
}

/** The level the next hint is, given how many the learner already has; null once they are used up. */
export function nextHintLevel(previous: number): HintLevel | null {
  return previous >= 0 && previous < TUTOR_LIMITS.maxHints ? ((previous + 1) as HintLevel) : null;
}

export function validateHint(
  hint: { text: string; labRef: string | null; lookFor: string | null },
  known: ReadonlySet<string>,
  level: HintLevel,
): Hint {
  const labRef = hint.labRef && known.has(hint.labRef) ? hint.labRef : null;
  return {
    level,
    text: fit(hint.text, TUTOR_FIELDS.hint),
    labRef,
    // A phrase to look for in a document we just dropped points nowhere.
    lookFor: labRef ? fit(hint.lookFor ?? "", TUTOR_FIELDS.lookFor) || null : null,
  };
}
