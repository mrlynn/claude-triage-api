import assert from "node:assert/strict";
import test from "node:test";
import {
  TUTOR_LIMITS,
  assembleDrill,
  sessionCount,
  validateLesson,
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
