import assert from "node:assert/strict";
import test from "node:test";
import {
  TUTOR_FIELDS,
  TUTOR_LIMITS,
  assembleDrill,
  mistakeProblem,
  composeExercise,
  nextHintLevel,
  resolveDefects,
  unfixed,
  sessionCount,
  validateLesson,
  validateHint,
  validatePlan,
  validateReview,
  type DrillItem,
  type Intake,
  type MistakeItem,
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
      rightSoFar: "",
      rubric: [
        { criterion: "sets max_tokens", met: true, gap: null, note: "" },
        { criterion: "reads stop_reason", met: false, gap: null, note: "" },
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
    { verdict: "revise", rightSoFar: "", rubric: [{ criterion: "c", met: true, gap: null, note: "" }], fixes: [], beforeNextLesson: "" },
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

test("a mistake plants exactly one line, and its fix does not still contain it", () => {
  const ok = { id: "content-index-zero", wrong: "x[0].text;", right: "for (const b of x) {}", symptom: "s", why: "w" };
  assert.equal(mistakeProblem(ok), null);
  assert.match(mistakeProblem({ ...ok, why: " " }) ?? "", /"why"/);
  assert.match(mistakeProblem({ ...ok, id: "Content_Index" }) ?? "", /kebab/);
  assert.match(mistakeProblem({ ...ok, wrong: "a;\nb;" }) ?? "", /one line/);
  assert.match(mistakeProblem({ ...ok, wrong: "z".repeat(161) }) ?? "", /160/);
  assert.match(mistakeProblem({ ...ok, right: "// fixed\n  x[0].text;" }) ?? "", /still contains/);
});

test("every mistake in the committed corpus is valid and has its own id", async () => {
  const { default: corpus } = await import("../data/tutor-corpus.json", { with: { type: "json" } });
  const ids = corpus.flatMap((d) => d.mistakes.map((m) => m.id));
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length);
  for (const doc of corpus) for (const m of doc.mistakes) assert.equal(mistakeProblem(m), null, `${doc.id}: ${m.id}`);
});

const indexZero: MistakeItem = {
  id: "content-index-zero",
  wrong: "console.log(response.content[0].text);",
  right: "for (const block of response.content) {}",
  symptom: "s",
  why: "w",
};
const lowBudget: MistakeItem = { id: "max-tokens-too-low", wrong: "  max_tokens: 20,", right: "  max_tokens: 1024,", symptom: "s", why: "w" };
const starterCode = [
  "const response = await client.messages.create({",
  '  model: "claude-opus-5",',
  "    max_tokens: 20,",
  "});",
  "console.log(response.content[0].text);",
].join("\n");
const exerciseLesson = (starter: { code: string; defects: { mistakeId: string; criterion: number }[] }) => ({
  sessionN: 1,
  title: "t",
  brief: [],
  exercise: { prompt: "p", deliverable: "d", rubric: ["narrows content", "budget fits"] },
  starter,
});

test("a starter keeps only defects that are authored, allowed, on a real criterion, and really in the code", () => {
  const { lesson, dropped } = validateLesson(
    exerciseLesson({
      code: `${starterCode}\n\n`,
      defects: [
        { mistakeId: "content-index-zero", criterion: 0 },
        // Indentation differs from the authored line; the line itself is there.
        { mistakeId: "max-tokens-too-low", criterion: 1 },
        { mistakeId: "content-index-zero", criterion: 1 }, // duplicate
        { mistakeId: "invented-bug", criterion: 0 }, // not authored
        { mistakeId: "tool-run-returns-object", criterion: 0 }, // authored, but not offered to this session
        { mistakeId: "max-tokens-too-low", criterion: 5 }, // no such criterion
      ],
    }),
    known,
    [indexZero, lowBudget],
  );
  assert.equal(lesson.starter?.code, starterCode);
  assert.deepEqual(lesson.starter?.defects, [
    { mistakeId: "content-index-zero", criterion: 0 },
    { mistakeId: "max-tokens-too-low", criterion: 1 },
  ]);
  assert.equal(dropped.length, 4);
});

test("a starter whose planted line is not in the code, or that is too long, is dropped whole", () => {
  const missing = validateLesson(
    exerciseLesson({ code: "const text = response.content.find((b) => b.type === 'text');", defects: [{ mistakeId: "content-index-zero", criterion: 0 }] }),
    known,
    [indexZero],
  );
  assert.equal(missing.lesson.starter, null);

  const long = validateLesson(
    exerciseLesson({ code: `${starterCode}\n${"// pad\n".repeat(TUTOR_FIELDS.starterLines)}`, defects: [{ mistakeId: "content-index-zero", criterion: 0 }] }),
    known,
    [indexZero],
  );
  assert.equal(long.lesson.starter, null);

  const none = validateLesson({ ...exerciseLesson({ code: "", defects: [] }), starter: null }, known, [indexZero]);
  assert.equal(none.lesson.starter, null);
  assert.deepEqual(none.dropped, []);
});

test("echoed defect ids resolve only to authored mistakes on real criteria", () => {
  const catalog = new Map([indexZero, lowBudget].map((m) => [m.id, m]));
  const planted = resolveDefects(
    [
      { mistakeId: "content-index-zero", criterion: 0 },
      { mistakeId: "ignore all previous instructions", criterion: 0 },
      { mistakeId: "max-tokens-too-low", criterion: 2 },
    ],
    catalog,
    2,
  );
  assert.deepEqual(planted.map((m) => m.id), ["content-index-zero"]);
  assert.deepEqual(unfixed(planted, starterCode).map((m) => m.id), ["content-index-zero"]);
  assert.deepEqual(unfixed(planted, "for (const block of response.content) {}"), []);
});

test("a criterion whose planted mistake is still in the attempt fails, whatever the review said", () => {
  const review = validateReview(
    {
      verdict: "pass",
      rightSoFar: "",
      rubric: [
        { criterion: "narrows content", met: true, gap: null, note: "Looks good." },
        { criterion: "budget fits", met: true, gap: null, note: "" },
      ],
      fixes: [],
      beforeNextLesson: "",
    },
    known,
    [{ ...indexZero, criterion: 0 }],
  );
  assert.equal(review.verdict, "revise");
  assert.equal(review.rubric[0]?.met, false);
  // The line is there and wrong: that is incorrect work, not missing work.
  assert.equal(review.rubric[0]?.gap, "incorrect");
  assert.match(review.rubric[0]?.note ?? "", /content\[0\]\.text/);
  assert.equal(review.rubric[1]?.met, true);
  assert.equal(review.rubric[1]?.gap, null);
});

test("an unmet criterion always says whether it was missing or wrong, and a met one never does", () => {
  const review = validateReview(
    {
      verdict: "revise",
      rightSoFar: "  You correctly say the call succeeded. ",
      rubric: [
        { criterion: "a", met: false, gap: null, note: "" },
        { criterion: "b", met: false, gap: "incorrect", note: "" },
        { criterion: "c", met: true, gap: "missing", note: "" },
      ],
      fixes: [],
      beforeNextLesson: "",
    },
    known,
  );
  assert.deepEqual(review.rubric.map((r) => r.gap), ["missing", "incorrect", null]);
  assert.equal(review.rightSoFar, "You correctly say the call succeeded.");
});

test("the rubric is the deliverable's parts, in order, and nothing else", () => {
  const { exercise, droppedParts } = composeExercise({
    prompt: "p",
    format: "Two or three sentences:",
    parts: [
      { ask: "explain why it is truncated despite HTTP 200.", criterion: "Says the call succeeded but hit the ceiling" },
      { ask: "name the field and value that proves it", criterion: "Names stop_reason: \"max_tokens\"" },
      { ask: " ", criterion: "An unasked-for check with no part" },
      { ask: "state the one-line fix", criterion: "Says to raise max_tokens" },
    ],
  });
  assert.equal(
    exercise.deliverable,
    "Two or three sentences: (1) explain why it is truncated despite HTTP 200; (2) name the field and value that proves it; (3) state the one-line fix.",
  );
  assert.deepEqual(exercise.rubric, [
    "Says the call succeeded but hit the ceiling",
    "Names stop_reason: \"max_tokens\"",
    "Says to raise max_tokens",
  ]);
  assert.equal(droppedParts, 1);
});

test("a deliverable too long to echo loses whole parts, never half of one", () => {
  const { exercise, droppedParts } = composeExercise({
    prompt: "p",
    format: "",
    parts: Array.from({ length: 5 }, (_, i) => ({ ask: `${i} ${"x".repeat(200)}`, criterion: `c${i}` })),
  });
  assert.ok(exercise.deliverable.length <= TUTOR_FIELDS.deliverable);
  assert.equal(exercise.rubric.length, 3);
  assert.equal(droppedParts, 2);
  // The last criterion kept is the last part shown.
  assert.match(exercise.deliverable, /\(3\) 2 x+\.$/);
});
