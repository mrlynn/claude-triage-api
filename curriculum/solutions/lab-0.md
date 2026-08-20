# Lab 0 — answers

**Q1. Why keep the gold set at twelve cases?**

Because every case is hand-labelled, and hand-labelling degrades with volume.
At twelve you can hold the whole set in your head, argue about each label, and
notice when two of them contradict each other. At two hundred you cannot, so in
practice the labels get produced faster and checked less — often by generating
them from a model, which quietly turns your eval into a measurement of
agreement with a previous model rather than of correctness.

The other loss is that a large set stops being read. A twelve-case failure
report is something you actually look at line by line; a two-hundred-case one
becomes a percentage.

None of which means twelve is *enough*. It is enough to catch a regression that
breaks a whole category, and not enough to support a claim about a rate. That
tradeoff is the honest position, and Lab 6 Q7 makes you size a set that can
support the rate claim instead.

**Q2. Which ticket did you disagree on?**

Most rooms disagree on `NW-T-1060` — the multi-intent one, where the customer
asks for a refund *and* an account email change in the same message, with a
mistyped order id. There is no wrong answer available: the message genuinely
contains two intents and the schema has one `category` field.

If you disagreed about `NW-T-1060`, the disagreement was about the **schema**,
not the ticket. That is the useful realization. A single-label classifier
applied to multi-intent input has a modelling problem, not an accuracy problem,
and no amount of prompt tuning fixes it — you either add a second field, route
on the primary intent and accept the loss, or split the ticket upstream.

`NW-T-1045` (flaking bottle lining, child's stomach upset) is the one people
get right but for varying reasons. Some label it `safety` because a child was
affected; some because handbook §5.4 says a safety report is logged even when
the customer downplays it. Both land on the same label here, but they diverge
on the next ticket, which is why the *reason* is worth surfacing out loud.

**Q3. Why is the confidence gap better than either number alone?**

Because a single mean confidence tells you about the model's manner, not its
accuracy. A model that reports 0.95 on everything has a high mean and a gap of
roughly zero, and its confidence field is decoration: you cannot threshold on
it, because thresholding requires that low scores predict something.

The gap says: when this model is wrong, does it *know*? A measured gap of
**~0.29** (0.87 on passes, ~0.58 on failures) means a confidence threshold
routes real work — set it at 0.6 and you catch most errors while sending most
tickets straight through. A gap near zero means a threshold either catches
nothing or blocks everything.

This is also why the calibration instruction in `TriageSchema`'s `.describe()`
text is load-bearing rather than documentation. Delete it and the gap collapses
while accuracy barely moves, which is the Lab 2 Step 2 experiment.

**Q4. What does the flip pattern tell you about confidence as a control?**

That it is a real signal and an insufficient one, and the two flipping cases
show both halves.

`eval-11` fails at ~0.46. A threshold at 0.6 routes it to a human, which is
exactly right — the ticket is genuinely multi-intent and no single confident
label exists. Confidence earned its keep.

`eval-03` fails at ~0.71. The same threshold passes it straight through. The
model is not hedging; it read "nine days" and applied an elapsed-day rule where
clause 3.2 specifies business days, and it is about as sure of that as it is of
the cases it gets right. A wrong answer delivered confidently is the failure
mode confidence cannot catch, because the score is the model's report on its
own state and that report is only as good as its reading of the rule.

So: threshold on confidence to catch ambiguity, and use something else to catch
misapplied rules. "Something else" here means a deterministic check — the
projected delivery date and today's date are both known, business days are
countable in code, and code does not have opinions about clause 3.2. That is
the argument Lab 8 generalizes when it moves refund authority out of a
model-judged boolean and into `enforceAuthority`.

**Q5. What is the smallest detectable improvement?**

Roughly **two cases, or 17 percentage points** — because that is the observed
run-to-run spread with nothing changed. Anything smaller is inside the noise,
and a single run showing 11/12 after a change that previously showed 10/12 is
not evidence of anything.

Three ways out, in increasing order of cost:

1. **Run it more than once.** Five runs of the current set costs about $0.45
   and turns one number into a distribution. Cheapest real improvement
   available, and almost nobody does it.
2. **Grow the set.** Variance falls roughly as the square root of n, so
   detecting a 5-point difference wants somewhere near a hundred cases — and
   now you are back to the labelling-quality problem in Q1.
3. **Stop measuring a rate.** Often you do not need "accuracy improved 4%."
   You need "the business-day rule now holds," which is a targeted assertion on
   one case class and needs no statistics at all.

Option 3 is usually the right answer and is usually reached last.

**Q6. Should `summary` be scored?**

*For not scoring it:* there is no single correct summary. Any automated check
would compare strings — exact match, embedding similarity, ROUGE — and all
three measure resemblance to one particular phrasing rather than correctness. A
summary that is accurate and differently worded would fail, which trains you to
edit the prompt toward the reference wording rather than toward good summaries.
That is overfitting to the metric, with extra steps.

*Against:* "unscored" means "unprotected." Nothing in this repo would notice if
`summary` started returning the empty string, or echoing the raw ticket, or
leaking the customer's card digits. It ships to a human reader in the ops
queue, so it has real failure modes and zero coverage.

*What to ship:* not a similarity score. Ship cheap invariants — non-empty, under
a length cap, contains no digit sequence longer than four, is not a substring of
the input — and leave quality to the LLM judge in Lab 6, which is the right
instrument for graded prose and is correctly kept out of the CI gate. The
lesson that transfers: the choice is not "score it" versus "don't." It is
"assert the properties you can state precisely, and judge the rest separately."

**Q7. Which eval belongs in CI?**

`eval:quick --gate`. Note that the reason is **not** cost — the scoreboard runs
about $0.09 against roughly $0.20 for the full harness, which is not a
difference worth designing around. The reason is determinism. `eval:quick`
compares enum values with `!==`, so the same input produces the same verdict,
and a red build points at a specific named case.

`npm run eval` includes the LLM judge, and the judge is too noisy to gate on —
three runs of this repo scored the tone judge at 3/4, then 1/4, then 2/4 on the
same four cases with nothing changed between runs. A 50-point spread cannot
detect a real change of any plausible size, so gating on it produces red builds
that mean nothing and teaches everyone to re-run until green.

The judge still earns its place; it just earns it in a different job. Run it
when you want to understand a result, not when you want a pass/fail. Lab 6
Q1 is where this gets argued properly.

## Extension notes

The instinct when writing a thirteenth case is to write one the system passes.
Push against it. A case that always passes contributes nothing but runtime — it
cannot go red, so it can never tell you anything.

Good candidates for a failing case: a ticket whose category is genuinely
contested (multi-intent, like `NW-T-1060`), one where the correct urgency
depends on a business-day calculation rather than an elapsed-day one
(`eval-03`'s trick), or a safety report phrased so casually that the safety
language never appears.

Whatever you write, fill in `notes` with the rule the case tests. Six months
from now that field is the only thing that distinguishes a real regression from
someone disagreeing with your label — and `eval:quick` prints it under every
failure precisely so that distinction is in front of you at the moment it
matters.
