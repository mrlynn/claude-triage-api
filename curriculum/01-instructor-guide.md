# Instructor guide

For anyone delivering this as a workshop, a self-paced course, or a
partner-enablement session.

---

## Who this is for

The labs assume a working software engineer who has written HTTP services and
read JSON. They do **not** assume ML background, prior LLM work, or familiarity
with Anthropic products. Where LLM-specific vocabulary shows up, it gets defined
at first use in [`00-concept-map.md`](00-concept-map.md).

**Python-first rooms.** The labs are TypeScript and every learner should work
through them in TypeScript — the teaching is in the API, not the language, and
splitting a room across two runtimes doubles the failure modes you have to
debug from the front. There is a parallel Python implementation of
`/v1/triage` and the scoreboard, and the right way to use it is as *reading*,
not as an alternative track: point Python developers at
[the deltas page](../python/labs/deltas.md) during a break, or at the end. It
is four differences, and one of them is a mistake worth showing anybody who
will ever port a schema.

Learners who arrive with prior LLM experience usually arrive with *stale* prior
experience. `budget_tokens`, assistant prefill, "respond only with JSON"
prompting, edge-runtime-for-streaming. Surface that early, in the pre-flight
below. Otherwise it surfaces on its own as a confusing bug in Lab 3.

---

## Formats

| Format | Duration | Content |
|---|---|---|
| Lightning talk | 45 min | Concept map + live demo of all four routes |
| Half day | 3.5 hrs | Lab 0, Labs 1–4, concept map, architecture walkthrough |
| Full day | 6.5 hrs | Lab 0, Labs 1–6 + assessment + extension time |
| Day 2 — production | 4 hrs | Labs 7–9: model choice, the trust boundary, and shipping it |
| Self-paced | ~4 hrs | Day 1 labs; solutions unlocked per-lab |

**Day 1 is the course, and Day 2 is optional.** Say this to the room at the
start, because otherwise a two-day agenda reads as a two-day commitment and
you lose the people who only had a day.

Labs 0–6 are the enablement asset: the four capabilities, one domain, about
four hours. Someone who does only Day 1 has learned the Claude API and has a
working service to show for it. Nothing in Day 1 is a setup for Day 2 that goes
unpaid if Day 2 never happens.

Day 2 is for people who are going to ship. It is the decisions that only arrive
once something is real — which model, what happens when the input is hostile,
what separates a demo from a service — and it assumes the Lab 0 scoreboard
exists, because every measurement in it is a comparison against that baseline.

Booking only one day is a legitimate choice, and the right one for most
audiences. Book Day 2 when the room has a project rather than a curiosity.

**Lab 0 is not optional and it is not a warm-up.** It is twenty minutes and it
establishes the scoreboard every later lab re-runs. Cutting it to save time
means Labs 2 and 5 have learners changing prompts with no way to tell whether
the change helped, which is the exact habit this course exists to break.

**Half-day timing (3.5 hrs including two breaks):**

| Time | Segment |
|---|---|
| 0:00–0:15 | Framing: the four-capability map, tier selection |
| 0:15–0:35 | Lab 0 |
| 0:35–0:50 | Lab 1 |
| 0:50–1:25 | Lab 2 |
| 1:25–1:35 | Break |
| 1:35–2:15 | Lab 3 |
| 2:15–2:40 | Lab 4 |
| 2:40–2:50 | Break |
| 2:50–3:20 | Architecture walkthrough (`docs/architecture.md`), Q&A |
| 3:20–3:30 | Where to go next |

Running behind, cut Lab 4 Steps 5–6 and the Lab 3 extensions. Never cut Lab 2.
It is the conceptual spine, and Labs 3 and 6 both build on it. Never cut Lab 0
either — see above.

---

## Pre-flight (send 48 hours ahead)

Learners who arrive without a working key lose 20 minutes, and they take a
neighbor's attention with them. Send this checklist:

- [ ] Send them [`setup.md`](setup.md). It covers everything below plus the
      two-terminal workflow and a troubleshooting table.
- [ ] Node 20+ (`node -v`)
- [ ] `jq` and `curl`. Every lab pipes JSON through `jq`, and it is the
      prerequisite people most often lack.
- [ ] An Anthropic API key with billing enabled. A key on an org with no credit
      fails at the first call with a message that reads like an auth error.
- [ ] `git clone && npm install && npm run smoke` completes
- [ ] Budget: measured costs are **~$0.10** for `npm run smoke` and **~$0.20**
      per `npm run eval`. With repeated runs across Labs 5 and 6, budget
      **$2–4 per learner** for the full sequence.

Have 2–3 spare keys on hand. Someone's will not work.

---

## What learners get wrong, by lab

### Lab 0

- **Skipping the hand-labelling in Step 2.** Learners want to run the command.
  Make them write three labels on paper first and compare with a neighbour. The
  disagreement on `NW-T-1060` is the whole lab — it is a multi-intent message
  against a single-label schema, so the argument is about the *schema*, not the
  ticket, and that reframe is what makes Lab 2 land.
- **Reading the score as a grade.** 10/12 is not a B. Push on what a one-case
  move can and cannot tell you; the second quiz item does this, but say it out
  loud too.
- **Not committing the baseline.** If nobody runs `--save`, nothing downstream
  has anything to compare against and the scoreboard steps in Labs 1–6 print
  "no baseline yet" for the rest of the day.

### Lab 1

- **`response.content[0].text`.** Everyone tries it. Let them hit the type
  error. It teaches the union better than a slide does, and then you can explain
  that adaptive thinking is on by default on this model family, so index 0 is
  frequently a `thinking` block rather than the text they were reaching for.
- **Confusing `max_tokens` with a budget.** The model cannot see it. It is a
  guillotine.

### Lab 2

- **Believing constrained output means correct output.** Step 3 exists to break
  this. The API guarantees the *shape*. Nothing guarantees the *content*.
- **Treating `.describe()` as comments.** The Step 2 experiment is the
  highest-value 8 minutes in the course. Do not skip it. Do not let a learner
  skip it because "the answer is obvious."
- **`parsed_output` non-null assertion.** Learners copy the `!` out of the docs.
  Ask what happens in production when it comes back null.

### Lab 3

- **Blaming the model for tool selection.** Step 2 reframes it as a description
  bug. That reframe transfers to almost every "the model is dumb" report you
  will ever get.
- **Not seeing the usage trap.** Some learners find Q3 genuinely hard. The key
  insight is that history grows each turn, so later turns carry more input than
  earlier ones, and the last turn is the largest one, which means reporting only
  that turn under-reports by less than 1/N and still badly. Sum every turn.
- **Uncapped loops.** If someone pulls `max_iterations` to see what happens,
  make sure they are watching their spend.

### Lab 4

- **Forgetting `curl -N`.** They will conclude streaming is broken. Take it as a
  gift. It is the Step 4 production bug, arriving early and for free.
- **`EventSource` in the extension.** It is GET-only. Discovering that is the
  point, so don't pre-empt it.
- **Assuming a non-2xx will surface stream errors.** Q4 is the one that saves
  them a production incident.

### Lab 5

- **Not restoring after breaks.** Have them `git diff` before moving on. A
  learner who leaves Break C in place gets confusing results in Lab 6.
- **Assuming caching is always a win.** Q5 is a real derivation. Make them do
  the arithmetic. The break-even is closer than they expect.

### Lab 6

- **Writing easy gold cases.** The instinct is to write cases the system passes.
  Push back. A case that always passes measures nothing.
- **Trusting the judge immediately.** Step 5 is not optional. A judge you have
  not validated is a random number generator with good manners.
- **Assuming a failure means the model is wrong.** Tell this one as a story,
  because it happened while this repo was being built. The first run of
  `evals/dataset.jsonl` scored 58%. Five of the six failures were *label*
  errors. `requested_remedy` had been labelled with the remedy the customer
  *should* get, and the schema asks for what they *explicitly asked for*, so on
  "My attorney will be contacting you about the tent poles that collapsed," the
  gold label said `escalation` and the model said `none` and the model was right.
  Fixing the labels moved the score without touching a line of prompt or code.

  The lesson that transfers: **when an eval fails, check the label before you
  check the model.** In mature systems a real share of "failures" are mislabeled
  cases. A gold set is a spec and it can have bugs like any other spec. The
  surviving cases in `dataset.jsonl` carry `notes` saying which rule each one
  tests, so the next person can tell a real regression from a disagreement about
  labels.

- **Judge variance is a teaching gift. Use it.** Three `npm run eval` runs scored
  the tone judge at 3/4, then 1/4, then 2/4 on a four-case sample. A 50-point
  swing, mostly unrelated to anything that changed. If a learner stumbles into
  this, don't treat it as a bug to fix. It is the most persuasive argument for
  Lab 6 Q1 you will ever get handed for free.

  Then push further, because the same runs found something real. The judge
  flagged replies promising a refund "today," which handbook clause 2.3 forbids.
  Refunds take 5-7 business days. The drafter system prompt had restated section
  1's *tone* rules and left clause 2.3 sitting unrestated in the handbook text,
  and under pressure the model did not go find it, so the fix was to hoist the
  hard constraints up into the role instructions, which is the same remedy
  `solutions/lab-6.md` Q4 prescribes.

  So one noisy signal was both too unstable to gate on and the thing that found
  a genuine prompt defect. Both are true at once. Holding both is the actual
  skill.

  Then make the hardest point. **After fixing, we deliberately did not re-run to
  show a better number.** At n=4 with that spread, a favourable run proves
  nothing, and tuning a prompt until a noisy judge approves is textbook
  overfitting to your own metric. The claim the evidence supports is narrow and
  qualitative. The judge's rationale on `eval-03` now credits the reply for
  stating the 5-7 day timeline. Ask the room what sample size they would need to
  support the *rate* claim instead. That is Lab 6 Q7, and most learners have
  never been asked to power-analyze an LLM eval.

---

### Lab 7

- **Reaching for the cheap tier before reading the budget.** The instinct is
  overwhelming and the lab is built to frustrate it. Make someone say out loud
  that $137/month against $4,000 means cost is not the binding constraint here.
  The transferable form: optimize the constraint that binds.
- **Reading the accuracy column and stopping.** Push them to the calibration
  gap. If the room only takes one thing from Day 2, it should be that a
  confidence score you have not checked for separation cannot carry a control.
- **Expecting the cheap tier to fail randomly.** It does not. It fails the
  multi-rule cases, and it fails `eval-04` — the safety case — at 0.95
  confidence. That single cell is the most persuasive thing on the page; put it
  on the screen.
- **Variance, again.** The matrix moves by up to two cases per model per run.
  Someone will get a run where Sonnet beats Opus on a case and want to build a
  theory on it. Point them back at Lab 0 Q5.
- **Timing.** `eval:models` takes 90 seconds and costs ~$0.19 per learner. If
  the room is on a shared key, run it once on the projector and have them read
  the checked-in matrix at `/playground/models` instead.

### Lab 8

- **Expecting prompt injection to be the whole lesson.** It is the hook. The
  substance is that `within_agent_authority` was a model-judged boolean nobody
  checked. Get someone to say out loud that the model was deciding whether the
  model was allowed.
- **Assuming a green gate means the defence is complete.** When this lab was
  built, the red-team run produced nine failures and **eight of them were
  mis-specified assertions**, including one that was literally inverted and two
  that failed the model for classifying a site-bug report as `other`. That is
  Lab 0's "check the label before the model" arriving in a new costume, and the
  case notes in `data/injections.jsonl` record it deliberately. Show them.
- **Forgetting the benign controls.** Three of the fourteen cases must NOT be
  blocked. Ask the room how they would score a defence that returns 400 for
  every request; the answer (12/12 on an attacks-only corpus) lands hard.
- **Skipping Step 5.** Measuring what the hardening cost is the step that
  separates this from security theatre. Budget for it.
- **Timing and cost.** `eval:redteam` is ~90 seconds and ~$0.40 per learner —
  the most expensive single command in the course. On a shared key, run it once
  on the projector.

### Demoing the live queue

Worth five minutes at the end of Lab 8, and it lands better than any slide
about human-in-the-loop.

1. Open the storefront's [support form](https://northwind-outfitters.vercel.app/support)
   and submit something a human must handle. The reliable one is a casually
   worded injury report — *"the bottle lining flaked and my kid swallowed a
   bit, probably nothing"* — because it is the October 2025 incident from the
   scenario, typed live.
2. Watch the pipeline reach `persist` and return a ticket id. Point out that
   the routine ticket you submitted earlier produced no id at all: storage is
   a consequence of escalation, not of submission.
3. Open `/queue?token=…` and work the ticket. Claim it, resolve it.
4. Open `/ops`. The escalation panel at the top is the only figure on that
   dashboard read from the database; everything below it is invented history,
   and both are badged. Ask the room which of the two they would trust in a
   board deck, and why the badge exists.

Two things to have ready: the `QUEUE_TOKEN` value, and the fact that the stored
message is redacted — expand the message on a card and show the
`[card ending 1111]` if someone submitted digits.

### Lab 9

- **The batch result is the lab.** Everyone arrives certain that batch is half
  price. It cost 23% MORE on this workload, because a cache read is 90% off and
  the two discounts compete on the same tokens. Do not spoil it — let them run
  all three commands and read the table. The moment the room realises why is
  the best five minutes of Day 2.
- **Do not overclaim it either.** At 400,000 tickets the prefix stays hot for
  hours and the result probably flips back. Lab 9 Q3 exists so nobody leaves
  believing "batch is a trap." The lesson is *measure*, not *avoid*.
- **Concurrency confusion.** Several learners will expect concurrency to cut
  cost. It cut wall clock 91s → 60s and nudged cost UP, because in-flight
  requests raced the cache write. Parallelism buys the clock, never the price.
- **The MCP step needs a client.** Have Claude Desktop or Claude Code
  pre-configured on the projector machine, or the step becomes reading a file.
- **Timing.** Step 1 alone is ~6 minutes of wall clock and about $0.55 per
  learner — by far the most expensive command in the course. On a shared key,
  run the three modes once on the projector and have the room read the
  [batch planner](https://claude-triage-labs.vercel.app/playground/batch)
  instead.

## Knowledge checks

Ten checks sit inline in the labs, at the point the idea is taught rather than
collected at the end. They are authored as ` ```quiz ` JSON blocks in the
markdown and rendered as components by a remark plugin, so the source stays
plain markdown and still reads on GitHub.

Two things about how they behave, both worth knowing before you point a room
at them. The explanation shows on every answer, right or wrong, because a
check that only explains failures teaches the people who guessed correctly
nothing. And there is no retry or score — these are checks on understanding,
not an exam, and the exam is a separate page.

Use them as pacing. If half the room is still reading when the rest have
answered, that is your signal to move.

## Discussion prompts that work

Use these when a group finishes early or the room goes quiet:

1. *"You have a working `/v1/triage`. Your PM asks for 99.9% accuracy. What do
   you tell them?"* Surfaces the gap between "the model is wrong" and "the labels
   are ambiguous," which is where most eval work actually lives.
2. *"Which of the four routes would you delete first if you had to ship
   tomorrow?"* Good tier-selection reasoning. The usual answer is `/resolve`, and
   the usual reason is that a workflow could replace it.
3. *"Your cache hit rate drops from 94% to 11% overnight. Nobody deployed. What
   happened?"* Traffic-pattern reasoning, TTL expiry, tenant fan-out.
4. *"What in this repo would you not ship?"* If nobody bites, the omissions list
   at the end of `docs/architecture.md` is a good backstop.

---

## Grading the assessment

[`assessment.md`](assessment.md) has 16 questions, and there is an auto-scored
version at [/assessment](https://claude-triage-labs.vercel.app/assessment)
that marks sections 1 and 2 and walks learners through self-assessing section
3. Suggested weighting:

| Section | Questions | Weight |
|---|---|---|
| Mechanics (API surface, parameters) | 1–7 | 30% |
| Diagnosis (given a symptom, find the cause) | 8–12 | 40% |
| Design judgment (open-ended) | 13–16 | 30% |

Diagnosis carries the most weight on purpose. Reciting that `cache_control`
exists is worth very little. Recognizing a flat-zero `cache_read_input_tokens`
as a timestamp in the prefix is the skill that transfers.

Questions 13–16 have no answer key, so score the reasoning. A learner who picks
the "wrong" option with a sound cost and latency argument should outscore one
who picks the "right" option from memory.

---

## Adapting this to another domain

The structure ports. Replace four things:

1. `data/policies.md` — the large stable document that gets cached
2. `src/schemas.ts` — the structured output contract
3. `src/tools/` — the systems the agent queries
4. `evals/dataset.jsonl` — the gold set

Everything else stays: usage accounting, error mapping, SSE, prompt assembly,
the lab scaffolding. Budget about a day for a port, and most of that day goes to
hand-labelling a gold set rather than to writing code, which is the right place
for the time to go.

**One warning.** The domain needs a *real* policy document with genuine edge
cases. A toy domain produces toy labs, because every interesting question in
Labs 2, 3, and 6 comes from a place where two rules touch.
