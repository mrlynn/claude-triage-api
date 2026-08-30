# Lab 7 — answers

**Q1a. Does the silent Haiku cache miss change the tier decision?**

No, and saying why is the whole exercise.

It does not change the decision, because the decision was never about cost.
Fixing the cache would take Haiku from ~$74 to ~$20 a month; the gap between
those two numbers is $54 against a $4,000 budget. Both round to free. An
argument that was already dominated by the accuracy column stays dominated by
the accuracy column.

What it changes is your confidence in every other number that table produced.
A measurement contained a fivefold error in one column and nothing flagged it —
not a test, not a review, not the person who wrote the "Haiku costs about half"
sentence underneath it. The correct update is not about Haiku. It is that this
repo could print a wrong cost figure and ship it, which means the next wrong
cost figure will also ship, and the next one may land on a decision where $54
is not the stake.

Notice also the shape of the error. It did not make the cheap tier look bad; it
made the cheap tier look *reasonable* — $74 sits close enough to Sonnet's $69
that the table reads as a coherent story about tiers. Errors that produce
implausible output get caught. This one produced a plausible story, which is
why it survived.

**Q1. What does the headroom do to the tier argument?**

It removes it. At 4,100 tickets a week the flagship costs about **$137 a
month** against a **$4,000** budget. The cheap tier saves roughly $70 as
measured — under 2% of the budget, in exchange for losing three to five cases
in twelve. Fix its caching and it saves ~$117, which is under 3%. The argument
does not improve when you give it its best case, which is the sign that it was
never a cost argument.

The general form is worth keeping: **cost optimization only matters where cost
is a binding constraint.** Northwind's binding constraint is the mis-routing
rate and the safety SLA, not the model bill. A team that optimizes the
non-binding constraint has done work that cannot show up in any outcome they
care about, and has spent accuracy to do it.

Where the argument *would* bite: raise volume to 400,000 tickets a week and
Opus becomes ~$13,000/month, over budget, and the tradeoff is live again. Or
add a latency SLA — the cheap tier is genuinely faster (p50 ~9s versus ~10–18s)
and that is a real difference for an interactive surface, though not for a
queue processed in batches.

So the honest recommendation for *this* system is: ship the flagship, and put
the effort you would have spent on tiering into the eval set instead.

**Q2. Is it a 5% problem?**

Much larger, and the accuracy number actively hides it.

The gold set is deliberately adversarial: twelve cases chosen because they sit
where rules touch. Real traffic is not distributed that way — most tickets are
"where is my package." So the cheap tier's *aggregate* accuracy on live traffic
would be far better than 6/12 suggests, and a naive rollout would look fine.

But the cases it loses are not randomly drawn from the distribution. They are
concentrated in exactly the population you built the system for. `eval-04` is a
child swallowing part of a product. Losing that case is not 8% of an accuracy
score; it is the failure mode from the October 2025 incident on
[the scenario page](../scenario.md), reproduced by choice.

To answer properly you would need the joint distribution: how often does live
traffic hit a two-rule case, and what does being wrong on one cost? Northwind
can estimate the first from a sample of the archive and the second from the
handbook's SLA penalties. That is the measurement, and it is a business
measurement rather than a model one.

The trap to name out loud: **aggregate accuracy on a representative sample and
aggregate accuracy on an adversarial sample answer different questions, and
neither answers "what does this cost me."**

**Q3. What does a threshold catch when the gap is zero?**

Roughly its base rate, which is to say nothing useful.

If confidence on wrong answers is drawn from the same distribution as
confidence on right ones, then thresholding at 0.7 selects ~the same fraction
of each. You escalate some wrong answers, you escalate just as many right ones,
and you pay for a second call on all of them. The precision of the mechanism is
the model's error rate — no better than escalating at random.

In the two runs where Haiku's gap came out negative, it is worse than random:
the threshold preferentially escalated cases the model had gotten *right*,
while passing the wrong ones straight through. You are paying a premium to
double-check the answers that did not need it.

The cost is not theoretical. Escalation on a low-signal model converges toward
"run every ticket twice," at which point you are paying the cheap tier plus the
flagship for a result no better than the flagship alone — strictly worse than
just calling the flagship.

**The rule that transfers: measure the calibration gap before you build
anything that routes on confidence.** It is one column in an eval you are
already running, and it is the difference between a control and a costly no-op.

**Q4. What message defeats `pickModel`?**

Any high-stakes ticket written without high-stakes vocabulary. The routing
signal is a keyword list, and the list can only match words the customer
happens to use.

The canonical example is already in this course: *"probably nothing, but the
bottle cap cracked and my kid swallowed a bit of plastic."* That one routes
correctly, because "swallowed" and "kid" are both on the list. Now write it the
way a worried, apologetic parent actually writes at 11pm: *"Hi — the lid on the
32oz came apart and some of it ended up in my daughter's mouth. She seems okay.
Just thought you should know."* No "swallow," no "injury," no "child." Under 240
characters, so it routes to the cheap tier, which is the tier that loses
`eval-04`.

It does not need an attacker. The failure mode is *politeness*.

**Why the failure is quiet:** nothing errors. The router logs a confident
`reason` ("short message, no high-stakes language"), the cheap model returns a
well-formed schema-valid classification with 0.9 confidence, and the ticket goes
in the normal queue. Every component reports success. The only artifact is a
`meta.routed.reason` in a log nobody reads, and you find out when the safety
SLA is missed — which is precisely the three-day delay from the scenario.

Two consequences worth stating:

1. **A keyword router is a defence-in-depth layer, never the only layer.**
   `requires_human` is decided by the model reading the whole message, not by
   `pickModel`, and that ordering is deliberate.
2. **Bias the router toward escalation.** The `HIGH_STAKES` list is
   over-broad on purpose. A false positive costs a fraction of a cent; a false
   negative costs the incident.

Lab 8 makes the adversarial version of this explicit, where the message is
written to route itself down deliberately.

**Q5. What is escalation worth?**

On the cheap tier: close to nothing, for the reasons in Q3. Its confidence does
not predict its errors, so the trigger fires on the wrong population.

On the middle tier: something real. Sonnet's gap is 0.20–0.30 — not flagship,
but genuinely informative, so a 0.7 threshold does select disproportionately
for wrong answers. `sonnet → escalate to opus` is a defensible architecture:
you pay flagship rates on the minority of tickets that are hard, and Sonnet
rates on the rest.

The general shape: **escalation is only as good as the calibration of the model
you escalate *from*.** It is not a safety net you can bolt onto any tier; it is
a mechanism that consumes a signal, and you have to check the signal exists.

Which reframes Steps 4 and 5 as complementary rather than alternative.
`pickModel` routes on the *input* and works regardless of the model's
self-knowledge, so it is what protects the safety case. Escalation routes on
the *output* and needs a calibrated model, so it is what catches genuine
ambiguity. Neither substitutes for the other, and a system that ships only the
second one has a hole exactly where it can least afford one.

**Q6. Two models score 11/12. Is that the same number?**

No, and there are three separate reasons, in increasing order of how much they
should worry you.

*Noise.* This set moves by up to two cases run-to-run with nothing changed. Two
observations of 11/12 are consistent with true rates anywhere from roughly 75%
to 100%. A twelve-case set cannot resolve a difference smaller than about eight
points, so "11/12 versus 11/12" is not evidence of equality — it is an absence
of evidence about anything.

*Composition.* Even if both are truly 11/12, they may be missing different
cases. One misses the deliberately ambiguous ticket; one misses the safety
report. Same score, and you would ship them into different jobs.

*What the score omits.* Accuracy is one column. Two models tied on it can differ
by a factor of ten in calibration gap — and Step 3 established that the gap
decides whether you can build a control on top of the model at all. The tie is
in the least informative column.

To distinguish them properly: run each five times and compare distributions
rather than points ($0.45 and the cheapest real improvement available), read the
disagreement matrix, and compare calibration gaps. If they still look identical,
you have learned something useful — pick on latency or price and stop
deliberating.

## Extension notes

Predict before you measure. Classification and prose generation load different
capabilities, and there is no rule that says a model that classifies worse also
writes worse. The cheap tiers may well write acceptable customer replies while
being materially worse at deciding what the reply should *say* — in which case
the correct architecture is not one tier for everything but a cheap drafter
behind an expensive classifier, which is a conclusion you can only reach by
measuring the two tasks separately.

Keep the judge pinned when you do it. The temptation to let each tier grade its
own prose is strong and it destroys the comparison.

Note also what you will be measuring: the judge itself swings 1/4 to 3/4 on
identical input. With a four-case sample you cannot distinguish tiers at all.
Raising the sample is most of the work, and deciding how far to raise it is
[Lab 6](../labs/lab-6-evals.md) Q7 all over again.

**Q7. What is the latency column worth here?**

For Northwind's triage queue: **almost nothing, and saying so is the point.**
4,100 tickets a week arrive into a queue nobody reads in real time. Whether a
classification takes 9 seconds or 22 makes no difference to any human — the
tickets are processed faster than they arrive at every tier, and the constraint
that binds is accuracy on the cases where two handbook rules interact. Shipping
Haiku to save 13 seconds nobody experiences, at the price of three to five
cases in twelve, is the same mistake as shipping it to save $65 against a
$4,000 budget. Same error, different column.

That is the transferable habit and it is worth stating flatly: **optimize the
constraint that binds.** A number being real, measured, and printed in your
table does not make it a decision input. Most of the columns in most model
comparisons are like this, and the discipline is knowing which one is yours
before you look.

*Now change the product.* Put the classifier in front of a person and latency
stops being decoration:

- **The storefront support form.** A customer watches the pipeline run while
  they wait. 22 seconds of spinner is a bad experience and 9 is a tolerable
  one, and the classification is not what they came for — they came to file a
  ticket. Ship the cheap tier and let the escalation path from Step 5 catch the
  cases where confidence is low.
- **An agent-assist panel** that classifies while a human reads the ticket. The
  budget is however long the person spends reading, which is a few seconds. p95
  is the number that matters, not p50, because the failure is "the panel was
  still empty when I finished reading" and that happens in the tail.
- **A phone IVR routing a live caller.** Nothing above is shippable; you need a
  different architecture, not a different tier.

Two things to carry out of that. Which *percentile* you read is part of the
decision — p50 tells you what the experience usually is, p95 tells you how
often it is bad, and an interactive surface is judged on the tail. And a
system with both workloads should not pick one row: Northwind's real answer is
the flagship on the batch queue and the cheap tier on the live form, which is
`pickModel` from Step 4 doing exactly the job it exists for.

The measurement caveats matter before you quote any of this. These are
four-in-flight, whole-request times through the local route, not
time-to-first-token and not single-request figures. `/v1/triage` does not
stream; a streaming surface would be judged on time-to-first-token instead, and
`/v1/draft` would need its own measurement that this matrix does not make.
