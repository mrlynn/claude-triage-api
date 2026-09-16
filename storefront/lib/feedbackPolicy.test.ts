import assert from "node:assert/strict";
import test from "node:test";
import { FeedbackBody, feedbackLabs, scrubComment } from "./feedbackPolicy";

test("a comment loses emails, phone numbers and API keys, and keeps token counts", () => {
  assert.equal(
    scrubComment("Email me at ada@example.com or call (555) 123-4567, key sk-ant-api03-abcDEF_123"),
    "Email me at [email removed] or call [number removed], key [api key removed]",
  );
  assert.equal(scrubComment("+44 20 7946 0958 please"), "[number removed] please");
  assert.equal(scrubComment("Lab 5 said 1500000 tokens cost $4.50"), "Lab 5 said 1500000 tokens cost $4.50");
  assert.equal(scrubComment("   "), null);
  assert.equal(scrubComment(null), null);
});

test("feedback needs a rating or a comment, unless it amends an earlier rating", () => {
  assert.equal(FeedbackBody.safeParse({ surface: "page" }).success, false);
  assert.equal(FeedbackBody.safeParse({ surface: "page", comment: "  " }).success, false);
  assert.equal(FeedbackBody.safeParse({ surface: "page", rating: "down" }).success, true);
  assert.equal(FeedbackBody.safeParse({ surface: "general", comment: "the video is silent" }).success, true);
  assert.equal(FeedbackBody.safeParse({ surface: "page", id: "a".repeat(43), reasons: ["confusing"] }).success, true);
});

test("a path is a path: no query string, no full URL", () => {
  const ok = (path: string) => FeedbackBody.safeParse({ surface: "page", rating: "up", path }).success;
  assert.equal(ok("/docs/labs/lab-5-prompt-caching"), true);
  assert.equal(ok("/docs/labs/lab-5?email=ada@example.com"), false);
  assert.equal(ok("https://triage.mlynn.dev/docs"), false);
  assert.equal(ok("x".repeat(201)), false);
});

test("labs come from known ids and from the course path, never invented", () => {
  const corpus = [
    { id: "lab-5", path: "/docs/labs/lab-5-prompt-caching" },
    { id: "lab-7", path: "/docs/labs/lab-7-choosing-a-model" },
  ];
  assert.deepEqual(feedbackLabs({ labIds: ["lab-7", "lab-99"], path: "/docs/labs/lab-5-prompt-caching/" }, corpus), [
    "lab-5",
    "lab-7",
  ]);
  assert.deepEqual(feedbackLabs({ labIds: [], path: "/tutor" }, corpus), []);
});
