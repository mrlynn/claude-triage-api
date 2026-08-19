# Lab 2 — answers

**Q1. When is `parsed_output` null, and what should production do?**

Null when the response could not be parsed and validated against the schema —
in practice, most often when generation was cut short by `max_tokens`, leaving
truncated JSON, or when the turn ended for a non-`end_turn` reason.

Production should: check `stop_reason` to distinguish causes, return a 502 (the
upstream produced something unusable — this is not the caller's fault), log the
raw text for diagnosis, and **not** silently retry in a loop. `src/routes/triage.ts`
does the first three. Note it returns 502 rather than 500 to signal an upstream
problem specifically.

**Q2. What happens to the confidence gap?**

Without the `.describe()`, scores cluster tightly near the top (typically
0.85–0.95) for both correct and incorrect classifications, so the gap between
mean-confidence-on-passes and mean-confidence-on-failures collapses toward
zero. With the calibration instruction, failures score measurably lower.

The **gap** is what matters, not the absolute value. A model that reports 0.95
on everything and is right 85% of the time gives you no way to route: there is
no threshold that separates the cases you should auto-resolve from the ones a
human should see. A model whose wrong answers score 0.6 while its right answers
score 0.9 gives you a usable threshold even if it is no more accurate overall.

Calibration is a *separability* property, not an accuracy property.

**Q3. What does the "lower the confidence instead" guidance buy you?**

Design A (with `other`) risks the model dumping every ambiguous ticket into
`other`, which produces a clean-looking metric and an unrouteable queue.
Design B (no `other`) forces a wrong-but-confident label on genuinely
out-of-domain messages.

The handbook guidance gives you a third path: force a real category *and*
require the uncertainty to be expressed in a field designed to carry it. You
get a routable label plus an honest signal about how much to trust it. The
enum design and the confidence design are solving the same problem from two
directions, and neither works alone.

**Q4. What would you have edited without a single schema?**

At minimum: (1) the prose description of the JSON shape in the system prompt;
(2) the hand-written TypeScript interface; (3) the parsing/validation code;
(4) any repair logic that handles a missing field; (5) the API response type
exposed to consumers; (6) the eval harness's expectations. Six places, drifting
independently.

With `zodOutputFormat` + `messages.parse` + `z.infer`, you edited one.

**Q5. Where does the breakpoint go for an expensive schema?**

Render order is `tools → system → messages`. The schema goes out with the
request on every call, so to cache it you need it inside the cached prefix —
meaning the breakpoint must fall *after* the schema and after the system
prompt, with only the volatile per-request content following it. In this
codebase that is exactly the existing arrangement: the breakpoint sits on the
frozen system block, and the varying user message comes later in `messages`.

The thing to avoid is any per-request variation ahead of the schema — a
dynamically built schema, a reordered enum, a regenerated description string.
Those invalidate the prefix and you pay for the schema every time.
