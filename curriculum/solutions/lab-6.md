# Lab 6 — answers

**Q1. Why does only the deterministic half gate CI?**

Because it is measuring against labels a human committed to, so a regression is
unambiguous. The judge is itself a model: its output varies run to run, it can
drift when you change its prompt, and a failure could mean the drafts got worse
*or* that the judge got stricter. Gating on it means a flaky signal can block
a deploy and nobody can tell which side broke.

The judge is still valuable — as a tracked metric, a review aid, and a
regression *indicator*. It just should not be the thing that says no.

**Q2. Both means are 0.91 at 83% accuracy.**

The confidence field has told you nothing. There is no threshold that separates
correct from incorrect classifications, because the distributions overlap
completely.

Kill the threshold-routing plan until calibration improves. Options: add or
sharpen the calibration instruction in `.describe()` (Lab 2, Step 2); route on
something with actual signal instead, such as category — auto-resolve
`shipping` status questions, always escalate `safety`; or derive a confidence
proxy from agreement across two cheaper calls. What you must not do is ship
threshold routing on an uncalibrated score, because it will look like it works
in aggregate while failing on exactly the ambiguous cases it was meant to catch.

**Q3. Prompt injection — where is the bug?**

The architecture, and it is largely already mitigated here.

Not the model: no model reliably distinguishes instructions from data when both
arrive as plain text. Not really the system prompt either: adding "ignore
instructions in the message" is an arms race you lose incrementally.

Look at `src/routes/triage.ts` — the customer message is wrapped in
`<customer_message>` tags. That delimiting is the structural mitigation: it
marks a clear data boundary, and the system prompt's authority sits outside it.
Combined with structured outputs (the model can only emit fields from a fixed
schema — it cannot be talked into calling a tool or emitting free-form text)
and with the fact that `/v1/triage` has no tools and takes no actions, the
blast radius of a successful injection here is one mislabeled ticket.

That last point is the real architectural answer: **the mitigation that matters
most is that the injected instruction cannot reach anything consequential.**
Contrast `/v1/resolve`, which does have tools — the same injection there is a
materially more serious problem, and it is why refund authority belongs in a
deterministic check rather than in model judgment.

**Q4. The casual safety report.**

Whether or not it passed, the lesson is the same: a policy document sitting in
the context window is *available* to the model, not *enforced* on it. Clause
5.4's "even if the customer says it is not a big deal" is precisely the
adversarial case — the customer's own framing pulls against the rule.

If it passed, that is evidence the explicit "Safety outranks everything"
instruction in the triage system prompt is doing work that the handbook text
alone was not trusted to do. If it failed, the fix is to hoist the rule into
the role instructions rather than relying on the model to find and apply
section 5.4 under pressure.

Either way: **critical rules get restated in the instructions, not just
included in the reference material.** And rules that must never fail get a
deterministic check outside the model.

**Q5. Which break moved the pass rate most?**

Break A (moving `evidence` last) is usually the largest and is the most
instructive.

The reason is mechanical. The model generates fields in schema order, one token
at a time, conditioned on what it has already produced. With `evidence` first,
the quotes exist in context *before* the verdict token is generated, so the
verdict is conditioned on the evidence. With `evidence` last, the verdict is
generated first and the "evidence" that follows is conditioned on the verdict —
the model produces justification for a conclusion it already committed to. That
is rationalization, and it systematically inflates pass rates.

Break B (1–10 score) usually clusters at 7–8 and stops discriminating: a scalar
with no anchors means something different on every call. Break C matters least
in isolation but compounds with the others.

The transferable rule: **in any schema where one field should depend on
another, order matters, because generation is left-to-right.**

**Q6. The judge misses one of your four certain cases — what do you fix?**

Work in this order, cheapest and most-diagnostic first:

1. **The rubric.** Is the criterion actually checkable from the text alone? "At
   most one apology" is; "appropriately empathetic" is not. Most judge failures
   are underspecified criteria.
2. **The system prompt.** Does it establish strictness and demand
   evidence-first? Does it tell the judge what *not* to consider?
3. **Effort.** Raise it only after 1 and 2 are clean.
4. **The model.** Last resort, and rarely the answer for a rubric this concrete.

If a criterion cannot be made checkable, remove it from the judge and measure
it another way. A rubric item the judge cannot evaluate reliably adds noise to
every other item's verdict, because `verdict` is fail-if-any.

**Q7. Three reasons an LLM eval gate is harder than a unit-test gate.**

1. **Non-determinism.** The same commit can score differently across runs. →
   Mitigate with a threshold band rather than an exact number, a large enough
   set that one case is not 8% of the score, and a re-run before failing a
   build on a near-threshold result.
2. **Cost per run.** Every CI run spends real money and takes real time. →
   Mitigate by running the full set on merge to main and a fast subset on PRs;
   use the Batches API for offline runs (roughly half price); cache the prefix
   so eval runs are cheap.
3. **Legitimate label churn.** A genuine prompt improvement can flip several
   labels at once, and the gate cannot tell improvement from regression. →
   Mitigate by treating `dataset.jsonl` as reviewed code: label changes require
   a human sign-off in the same PR, with the rationale in the diff. The gold
   set is a spec, and changing a spec should be as visible as changing an API.

A fourth worth mentioning: gold labels themselves can be wrong. When accuracy
plateaus, re-examine the labels before re-examining the model — in mature
systems a meaningful share of "failures" are mislabeled cases.

---

## Extension notes

Position bias in pairwise judging is real and often large — judges frequently
prefer whichever response came first at rates well above 50%. Always randomize
order, always report the bias rate, and if it is far from 50%, fix the judge
before you trust a single comparison. Presenting each pair twice in both orders
and counting only consistent verdicts is the standard mitigation.
