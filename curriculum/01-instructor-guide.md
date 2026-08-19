# Instructor guide

For anyone delivering this as a workshop, a self-paced course, or a
partner-enablement session.

---

## Who this is for

The labs assume a working software engineer who has written HTTP services and
read JSON. They do **not** assume ML background, prior LLM work, or familiarity
with Anthropic products. Where LLM-specific vocabulary shows up, it gets defined
at first use in [`00-concept-map.md`](00-concept-map.md).

Learners who arrive with prior LLM experience usually arrive with *stale* prior
experience. `budget_tokens`, assistant prefill, "respond only with JSON"
prompting, edge-runtime-for-streaming. Surface that early, in the pre-flight
below. Otherwise it surfaces on its own as a confusing bug in Lab 3.

---

## Formats

| Format | Duration | Content |
|---|---|---|
| Lightning talk | 45 min | Concept map + live demo of all four routes |
| Half day | 3.5 hrs | Labs 1–4, concept map, architecture walkthrough |
| Full day | 6.5 hrs | Labs 1–6 + assessment + extension time |
| Self-paced | ~4 hrs | All labs; solutions unlocked per-lab |

**Half-day timing (3.5 hrs including two breaks):**

| Time | Segment |
|---|---|
| 0:00–0:20 | Framing: the four-capability map, tier selection |
| 0:20–0:40 | Lab 1 |
| 0:40–1:15 | Lab 2 |
| 1:15–1:25 | Break |
| 1:25–2:10 | Lab 3 |
| 2:10–2:40 | Lab 4 |
| 2:40–2:50 | Break |
| 2:50–3:20 | Architecture walkthrough (`docs/architecture.md`), Q&A |
| 3:20–3:30 | Where to go next |

Running behind, cut Lab 4 Steps 5–6 and the Lab 3 extensions. Never cut Lab 2.
It is the conceptual spine, and Labs 3 and 6 both build on it.

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

[`assessment.md`](assessment.md) has 12 questions. Suggested weighting:

| Section | Questions | Weight |
|---|---|---|
| Mechanics (API surface, parameters) | 1–4 | 30% |
| Diagnosis (given a symptom, find the cause) | 5–8 | 40% |
| Design judgment (open-ended) | 9–12 | 30% |

Diagnosis carries the most weight on purpose. Reciting that `cache_control`
exists is worth very little. Recognizing a flat-zero `cache_read_input_tokens`
as a timestamp in the prefix is the skill that transfers.

Questions 9–12 have no answer key, so score the reasoning. A learner who picks
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
