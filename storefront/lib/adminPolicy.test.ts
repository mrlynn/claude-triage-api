import assert from "node:assert/strict";
import test from "node:test";
import { errorCode, parseAdminIds, reviewRecord } from "./adminPolicy";

test("admin ids: numeric GitHub ids only, and an unset list admits nobody", () => {
  assert.deepEqual([...parseAdminIds("123, 456")], ["gh:123", "gh:456"]);
  assert.equal(parseAdminIds(undefined).size, 0);
  assert.equal(parseAdminIds("").size, 0);
  // A login is not an id: logins can be renamed and re-registered by someone else.
  assert.deepEqual([...parseAdminIds("mrlynn, 0, -1, 12x, gh:5, 789")], ["gh:789"]);
});

test("error codes never carry the message", () => {
  const upstream = Object.assign(new Error("prompt said: my card is 4242…"), { status: 429 });
  assert.equal(errorCode(upstream), "http_429");
  assert.equal(errorCode(Object.assign(new Error("x"), { name: "AbortError" })), "aborted");
  class TutorError extends Error {
    name = "TutorError";
  }
  assert.equal(errorCode(new TutorError("the learner wrote …")), "invalid_output");
  assert.equal(errorCode(new Error("anything at all")), "error");
  assert.equal(errorCode("crashed"), "crashed");
  assert.equal(errorCode(null), "error");
});

const known = {
  labs: new Set(["lab-5", "lab-7"]),
  mistakeLab: (id: string) => ({ "cache-miss": "lab-5", "wrong-price": "lab-7" })[id],
};

test("a review is reduced to counts, with planted mistakes judged by their criterion", () => {
  const record = reviewRecord(
    {
      verdict: "revise",
      rubric: [
        { met: true, gap: null },
        { met: false, gap: "incorrect" },
        { met: false, gap: "missing" },
      ],
    },
    {
      labIds: ["lab-5", "not-a-lab"],
      defects: [
        { mistakeId: "cache-miss", criterion: 0 },
        { mistakeId: "wrong-price", criterion: 1 },
        { mistakeId: "invented", criterion: 2 },
      ],
    },
    known,
  );
  assert.deepEqual(record, {
    // Unknown lab ids are dropped; a planted mistake's lab is added.
    labIds: ["lab-5", "lab-7"],
    verdict: "revise",
    criteria: 3,
    met: 1,
    missing: 1,
    incorrect: 1,
    mistakes: [
      { id: "cache-miss", fixed: true },
      { id: "wrong-price", fixed: false },
    ],
  });
  // Nothing a learner or the model wrote has a field to land in.
  assert.deepEqual(Object.keys(record).sort(), ["criteria", "incorrect", "labIds", "met", "missing", "mistakes", "verdict"]);
});

test("a defect pointing past the rubric counts as not fixed rather than throwing", () => {
  const record = reviewRecord(
    { verdict: "pass", rubric: [{ met: true, gap: null }] },
    { labIds: [], defects: [{ mistakeId: "cache-miss", criterion: 4 }] },
    known,
  );
  assert.deepEqual(record.mistakes, [{ id: "cache-miss", fixed: false }]);
});
