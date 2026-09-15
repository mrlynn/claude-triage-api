import assert from "node:assert/strict";
import test from "node:test";
import {
  TUTOR_FIELDS,
  TUTOR_LIMITS,
  assembleDrill,
  nextHintLevel,
  sessionCount,
  validateLesson,
  validateHint,
  validatePlan,
  validateReview,
  type DrillItem,
  type Intake,
  type Plan,
} from "./tutorPolicy";

/**
 * The Tutor's guarantees: it never cites a lab that does not exist, never
 * serves a drill with no right answer, never changes the scope the learner
 * confirmed, and never passes an attempt that missed a criterion.
 */

const known = new Set(["lab-1", "lab-2", "lab-4"]);
const intake: Intake = { days: 2, sessionsPerDay: 2, minutesPerSession: 25, level: "some", focus: [] };

const session = (n: number, labIds: string[]) => ({
  n,
  title: `S${n}`,
  minutes: 999,
  day: 9,
  labIds,
  objectives: ["x"],
  whyNow: "y",
});

test("session count is days × per day, clamped to the ceiling", () => {
  assert.equal(sessionCount({ days: 3, sessionsPerDay: 2 }), 6);
  assert.equal(sessionCount({ days: 30, sessionsPerDay: 3 }), TUTOR_LIMITS.maxSessions);
  assert.equal(sessionCount({ days: 0, sessionsPerDay: 1 }), 1);
});

test("a plan cannot cite a lab the corpus does not contain", () => {
  const plan: Plan = { goal: "g", doneMeans: [], gaps: [], sessions: [session(1, ["lab-1", "lab-11"])] };
  const { plan: out, dropped } = validatePlan(plan, known, intake);
  assert.deepEqual(out.sessions[0]?.labIds, ["lab-1"]);
  assert.deepEqual(dropped, ["lab-11"]);
});

test("a session citing nothing real is removed, and sessions are renumbered", () => {
  const plan: Plan = {
    goal: "g",
    doneMeans: [],
    gaps: [],
    sessions: [session(1, ["lab-99"]), session(2, ["lab-2"])],
  };
  const { plan: out } = validatePlan(plan, known, intake);
  assert.equal(out.sessions.length, 1);
  assert.equal(out.sessions[0]?.n, 1);
});

test("the model cannot widen the scope the learner confirmed", () => {
  const plan: Plan = {
    goal: "g",
    doneMeans: [],
    gaps: [],
    sessions: Array.from({ length: 9 }, (_, i) => session(i + 1, ["lab-1"])),
  };
  const { plan: out } = validatePlan(plan, known, intake);
  assert.equal(out.sessions.length, 4);
  assert.ok(out.sessions.every((s) => s.minutes === 25));
  assert.deepEqual(out.sessions.map((s) => s.day), [1, 1, 2, 2]);
});

test("authored quiz items come first; invalid and duplicate generated items are dropped", () => {
  const corpus = [
    { id: "lab-2", quizzes: [{ question: "Authored?", options: ["a", "b"], answer: 1, explain: "e" }] },
  ];
  const generated: DrillItem[] = [
    { question: "authored?", options: ["a", "b"], answer: 0, explain: "dup", labId: "lab-2", source: "generated" },
    { question: "Out of range", options: ["a", "b"], answer: 2, explain: "e", labId: "lab-2", source: "generated" },
    { question: "Fake lab", options: ["a", "b"], answer: 0, explain: "e", labId: "lab-42", source: "generated" },
    { question: "Good", options: ["a", "b", "c"], answer: 2, explain: "e", labId: "lab-2", source: "authored" },
  ];
  const { drill, dropped } = assembleDrill(corpus, ["lab-2"], generated, known);
  assert.deepEqual(drill.map((d) => d.question), ["Authored?", "Good"]);
  assert.equal(drill[0]?.source, "authored");
  // A model cannot label its own item as authored.
  assert.equal(drill[1]?.source, "generated");
  assert.equal(dropped, 3);
});

test("a lesson brief point citing an unknown lab is dropped", () => {
  const { lesson, dropped } = validateLesson(
    {
      sessionN: 1,
      title: "t",
      brief: [
        { point: "real", labId: "lab-4" },
        { point: "invented", labId: "lab-4b" },
      ],
      exercise: { prompt: "p", deliverable: "d", rubric: ["r"] },
    },
    known,
  );
  assert.deepEqual(lesson.brief.map((b) => b.point), ["real"]);
  assert.deepEqual(dropped, ["lab-4b"]);
});

test("a pass with an unmet criterion is recorded as revise", () => {
  const review = validateReview(
    {
      verdict: "pass",
      rubric: [
        { criterion: "sets max_tokens", met: true, note: "" },
        { criterion: "reads stop_reason", met: false, note: "" },
      ],
      fixes: [{ issue: "i", why: "w", labRef: "lab-77" }],
      beforeNextLesson: "b",
    },
    known,
  );
  assert.equal(review.verdict, "revise");
  assert.equal(review.fixes[0]?.labRef, null);
});

test("a revise verdict with every criterion met stays revise", () => {
  const review = validateReview(
    { verdict: "revise", rubric: [{ criterion: "c", met: true, note: "" }], fixes: [], beforeNextLesson: "" },
    known,
  );
  assert.equal(review.verdict, "revise");
});

test("a plan the model over-wrote still fits the lesson route it will be echoed to", () => {
  const long = "x".repeat(1_000);
  const plan: Plan = {
    goal: "g",
    doneMeans: [],
    gaps: [],
    sessions: [
      {
        ...session(1, ["lab-1", "lab-2", "lab-4", "lab-1", "lab-2"]),
        title: `  ${long}`,
        objectives: ["", "  ", ...Array.from({ length: 9 }, () => long)],
        whyNow: long,
      },
    ],
  };
  const s = validatePlan(plan, known, intake).plan.sessions[0]!;
  assert.ok(s.title.length <= TUTOR_FIELDS.title);
  assert.ok(s.labIds.length <= TUTOR_FIELDS.labIds);
  assert.equal(s.objectives.length, TUTOR_FIELDS.objectives);
  assert.ok(s.objectives.every((o) => o.length > 0 && o.length <= TUTOR_FIELDS.objective));
  assert.ok(s.whyNow.length <= TUTOR_FIELDS.whyNow);
});

test("an exercise the model over-wrote still fits the review route", () => {
  const long = "y".repeat(10_000);
  const { lesson } = validateLesson(
    {
      sessionN: 3,
      title: " ",
      brief: [],
      exercise: { prompt: long, deliverable: long, rubric: ["", ...Array.from({ length: 12 }, () => long)] },
    },
    known,
  );
  assert.equal(lesson.title, "Session 3");
  assert.ok(lesson.exercise.prompt.length <= TUTOR_FIELDS.prompt);
  assert.ok(lesson.exercise.deliverable.length <= TUTOR_FIELDS.deliverable);
  assert.equal(lesson.exercise.rubric.length, TUTOR_FIELDS.rubric);
  assert.ok(lesson.exercise.rubric.every((r) => r.length > 0 && r.length <= TUTOR_FIELDS.rubricItem));
});

test("an exercise with no usable rubric still has one criterion to grade against", () => {
  const { lesson } = validateLesson(
    { sessionN: 1, title: "t", brief: [], exercise: { prompt: "p", deliverable: "d", rubric: ["  "] } },
    known,
  );
  assert.equal(lesson.exercise.rubric.length, 1);
});

test("hints escalate by count and stop at the ceiling", () => {
  assert.equal(nextHintLevel(0), 1);
  assert.equal(nextHintLevel(2), 3);
  assert.equal(nextHintLevel(TUTOR_LIMITS.maxHints), null);
  assert.equal(nextHintLevel(-1), null);
});

test("a hint never points at a lab that does not exist, and fits what the page echoes back", () => {
  const hint = validateHint({ text: "z".repeat(5_000), labRef: "lab-11", lookFor: "Parsing" }, known, 2);
  assert.equal(hint.level, 2);
  assert.equal(hint.labRef, null);
  assert.equal(hint.lookFor, null);
  assert.equal(hint.text.length, TUTOR_FIELDS.hint);

  const cited = validateHint({ text: " Look at parse() ", labRef: "lab-2", lookFor: "  " }, known, 1);
  assert.equal(cited.text, "Look at parse()");
  assert.equal(cited.labRef, "lab-2");
  assert.equal(cited.lookFor, null);
});
