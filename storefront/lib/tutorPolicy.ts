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
 *      verdict is derived from the rubric, not asserted alongside it.
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
} as const;

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

export interface Lesson {
  sessionN: number;
  title: string;
  brief: { point: string; labId: string }[];
  drill: DrillItem[];
  exercise: { prompt: string; deliverable: string; rubric: string[] };
}

export interface Review {
  verdict: "pass" | "revise";
  rubric: { criterion: string; met: boolean; note: string }[];
  fixes: { issue: string; why: string; labRef: string | null }[];
  beforeNextLesson: string;
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
      return { ...s, labIds };
    })
    // A session that cites nothing real has nothing real to teach.
    .filter((s) => s.labIds.length > 0)
    .slice(0, target)
    .map((s, i) => ({
      ...s,
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
): { lesson: Omit<Lesson, "drill">; dropped: string[] } {
  const dropped: string[] = [];
  const brief = lesson.brief.filter((b) => {
    if (known.has(b.labId)) return true;
    dropped.push(b.labId);
    return false;
  });
  return { lesson: { ...lesson, brief }, dropped };
}

export function validateReview(review: Review, known: ReadonlySet<string>): Review {
  const anyMissed = review.rubric.some((r) => !r.met);
  return {
    ...review,
    verdict: anyMissed ? "revise" : review.verdict,
    fixes: review.fixes.map((f) => ({ ...f, labRef: f.labRef && known.has(f.labRef) ? f.labRef : null })),
  };
}
