# Lab 7 — Choosing a model

**Time:** 45 minutes · **Prerequisites:** Lab 0, Lab 2, Lab 6

## Why this matters

Everything you have built so far runs on `claude-opus-5`, because
`src/config.ts` says so and nobody questioned it. That is the most expensive
model in the lineup, doing a bounded classification task, 4,100 times a week.
Stated that way it sounds obviously wrong, and every cost-optimization article
you have ever read is about to tell you to move down a tier.

This lab is going to talk you out of that — not on principle, but on
measurement, and not in the direction you expect.

In April 2026 a team at a company much like Northwind moved their classifier
from a flagship model to a cheap one. Accuracy dropped from 94% to 89%, which
they accepted: five points for an 80% cost cut looked like a good trade on the
slide. What the slide did not say was *which* five points. The cases the cheap
model lost were disproportionately the ones where two policy rules touched —
and "two rules touch" is a fair description of every case that matters. The
routine ones were routine for both models.

They also kept their confidence-threshold escalation in place, and it kept
reporting that everything was fine. It was not. That part is the most useful
thing in this lab, and you will measure it yourself in Step 3.

---

```try
{
  "tool": "models",
  "title": "See the matrix without running it",
  "lead": "A checked-in eval:models run — accuracy, calibration gap, and the per-case disagreement grid. The cheap tier's failures concentrate where two rules touch.",
  "href": "/playground/models"
}
```

## Objectives

By the end you can:

- Run the same gold set across tiers and read a disagreement matrix
- Explain why a pinned judge is a precondition for the comparison, not a detail
- Implement confidence-based escalation and say when it does not work
- Make a model decision from evidence and write down what would change it

```mermaid
flowchart LR
    In["ticket"] --> Pick["pickModel()<br/>(pre-call signals)"]
    Pick --> Cheap["cheap tier"]
    Cheap --> Conf{"confidence<br/>&lt; 0.7?"}
    Conf -->|no| Out["result"]
    Conf -->|yes| Flag["flagship<br/>(second pass)"]
    Flag --> Out
```

---

## Step 1 — run the matrix

```bash
npm run eval:models -- --no-judge
```

Three models, twelve cases, four in flight. About ninety seconds and $0.19.

Read the table top to bottom before you read any single column. The measured
result on this repo, across four runs:

| model | accuracy | p50 | p95 | $/mo @ 4,100/wk | calibration gap | prefix cached? |
|---|---|---|---|---|---|---|
| `claude-opus-5` | 10–12 / 12 | 17.8s | 22.4s | ~$137 | 0.35–0.41 | yes |
| `claude-sonnet-5` | 7–9 / 12 | 15.7s | 18.2s | ~$70–98 † | 0.20–0.30 | yes |
| `claude-haiku-4-5` | 6–8 / 12 | 9.1s | 9.7s | ~$67–74 | −0.06 to +0.13 | **no** |

† The Sonnet projection was measured while `MODEL_CATALOG` encoded $3/$15 for
Sonnet 5. That rate has since been corrected to **$2/$10**, so a re-run lands
roughly a third lower. The `$/mo` column is computed from `specFor()` at run
time, not hardcoded, so `npm run eval:models` gives you the current figure — and
the fact that a stale rate in one file silently propagated into a printed table
in another is the same lesson this step is already about.

The latency columns come from the same run and almost nobody reads them either.
Two things about how they were measured, because a latency number without its
conditions is decoration: models run **sequentially** so one tier's traffic
never queues behind another's, and cases run **four in flight** within a model,
so these include some self-contention and are not single-request figures. They
are also whole-request times through the local route, not time-to-first-token —
`/v1/triage` does not stream, and for a classifier that is the number that
matters.

### The cost column is lying to you, and Lab 5 told you how

Haiku is roughly half the wall clock of Opus and appears to cost about half as
much. Stop on that second number, because it does not survive five seconds of
arithmetic. Haiku 4.5 is **$1/$5** per MTok against Opus 5's **$5/$25** — five
times cheaper per token. A tier that is five times cheaper per token is not
half the price unless something else is going on.

Something else is going on. Work it out before reading further:

```bash
curl -s localhost:8787/v1/estimate -H 'content-type: application/json' \
  -d '{"message":"test","role":"triage"}' | jq '{tokens, meta}'
```

Now point the whole service at the cheap tier and run the smoke test, which
makes two identical-prefix calls and asserts on `cache_hit`:

```bash
TRIAGE_MODEL=claude-haiku-4-5 npm run smoke
```

It passes — and the interesting part is *why* it passes:

```
"cache_minimum_tokens": 4096,
"prefix_meets_cache_minimum": false,
"warning": "The cacheable prefix is 2749 tokens, below the 4096-token
            minimum for claude-haiku-4-5. The cache_control breakpoint will
            be accepted and ignored: no error, no cache."
...
cache_creation_input_tokens: 0
cache_read_input_tokens: 0
cache_hit: false          ← on BOTH identical calls
```

The breakpoint is accepted and ignored: HTTP 200, correct answers,
`cache_read_input_tokens: 0`, forever. Every Haiku row in this lab paid full
input rate on the handbook, on every one of those twelve cases.

Note the prefix is **2,749** tokens here, not the ~3,400 you saw on Opus 5.
Nothing about the prompt changed — models tokenize differently, so even the
size of your prefix is a per-model number. It happens not to matter this time
(both are under 4,096), but a prefix sitting near a boundary could cross it on
a tier change with no diff to the prompt at all.

The smoke test does not fail here, and that is a deliberate design choice
worth arguing with. A cache miss on two identical calls is normally the most
expensive silent failure in this repo, and the script asserts on it. But on a
model that *cannot* cache this prefix, the miss is the expected result, and
failing would attach a confidently wrong diagnosis — "something in your prefix
is varying, lengthen `data/policies.md`" — to a prompt with nothing wrong with
it. So the assertion inverts: on a model under its minimum, smoke fails if a
cache hit ever *does* appear, because that would mean the minimum in
`src/config.ts` is stale and this lab's cost table is wrong again.

**Q1b.** Argue the other side. Smoke now passes on a configuration that costs
roughly 3.7× more per ticket than it needs to. Is "expected" the same as
"fine", and where should that fact fail loudly instead — a test, a startup
check, a dashboard, a code review? Say who you expect to catch it and when.

Check the arithmetic on the two scenarios at 17,800 tickets a month, using the
representative shape from Lab 5 (112 input, 134 output, 3,358 prefix):

| | prefix | input | output | $/mo |
|---|---|---|---|---|
| Haiku, cache working | 3,358 × $0.10/M | 112 × $1/M | 134 × $5/M | **~$20** |
| Haiku, cache silently off | 3,358 × $1/M | 112 × $1/M | 134 × $5/M | **~$74** |

The measured column says $67–74. That is not "Haiku costs about half as much."
That is Lab 5's silent cache miss, sitting inside a cost table in a different
lab, wearing a tier comparison as a disguise — and it was in this table for
some time before anyone divided $5 by $1 and asked why the answer was not five.

The checked-in run in
[`website/src/data/model-matrix.json`](../../website/src/data/model-matrix.json)
settles it without needing a new run. Read `cost_per_ticket`:

| model | $/ticket, measured |
|---|---|
| `claude-opus-5` | 0.0076 |
| `claude-sonnet-5` | 0.0039 |
| `claude-haiku-4-5` | 0.0038 |

Sonnet and Haiku cost **the same per ticket**, to two significant figures,
while Sonnet's per-token rate is double Haiku's. There is no version of that
which is a coincidence. Sonnet's prefix is cached and Haiku's is not; the
discount and the rate difference happen to cancel. Two rows agreeing is the
kind of result that should stop you, and for a while it did not stop anyone.

> **The transferable habit:** when a cost measurement disagrees with the rate
> card, believe neither until you can explain the gap. The explanation is
> almost always a discount you assumed you were getting.

**Q1a.** The savings you would get from switching to Haiku are roughly $63 a
month as measured, or $117 if the cache worked. Both are noise against a $4,000
budget. So does this discovery change the tier decision at all? Say what it
changes and what it does not — they are not the same thing.

**Q1.** Priya's budget is $4,000 a month. Every row above fits inside it with
between thirty and sixty times the headroom. What does that do to the argument
for moving down a tier?

## Step 2 — read the disagreement matrix, not the score

The score tells you how many. The matrix tells you which, and which is the
question you can act on.

Two patterns reproduce across runs. `eval-04` — the safety case, a customer
reporting that a child swallowed part of a product — fails on Haiku in three
runs out of four and never fails on Opus. And `eval-10`, delivered-not-received
under clause 3.4, fails on both cheap tiers nearly every time.

Neither is random. Both are cases where the correct answer requires holding two
handbook rules at once and preferring the one that is not the obvious reading.

**Q2.** The cheap tier loses cases where two rules interact, and holds its own
on cases with one clear rule. Given Northwind's actual ticket mix, is that a
5% problem or a much larger one? What would you need to measure to answer that
properly?

## Step 3 — the column nobody reads

Look at the calibration gap again. Opus separates its wrong answers from its
right ones by about 0.38. Haiku separates them by roughly **zero**, and in two
of four runs the gap came out *negative* — it was more confident on the cases
it got wrong than on the ones it got right.

One row makes the point better than the aggregate does. On `eval-04` — the
safety case, a customer reporting that a child swallowed part of a product —
Haiku returns the wrong classification at **0.95 confidence**. Not hedged, not
borderline: the highest score it gave any case in the run, on the case where
being wrong is most expensive.

Now consider what that does to the escalation mechanism you are about to build.
`?escalate=true` re-runs on the flagship when confidence falls below 0.7. That
works exactly to the extent that low confidence predicts a wrong answer.

**Q3.** On a model whose calibration gap is zero, what fraction of wrong
answers does a confidence threshold catch? What does the mechanism actually do
to your bill in that case?

```quiz
[
  {
    "question": "A cheap model scores 8/12 with a calibration gap of 0.02. What does the gap tell you?",
    "options": [
      "That the model is badly tuned and needs a better prompt",
      "That its confidence score carries almost no information about correctness",
      "That it is well calibrated — a small gap means consistent scoring"
    ],
    "answer": 1,
    "explain": "A gap near zero means the confidence distribution on wrong answers overlaps the one on right answers. There is no threshold that separates them, so any routing rule built on that score is a coin flip that costs money. Note the trap in option 3: 'consistent' sounds like a virtue, but consistency here means the score says the same thing regardless of whether the answer is right, which is exactly what makes it useless.",
    "note": "This is why the matrix prints the gap next to accuracy rather than in a footnote."
  },
  {
    "question": "Why does `evals/compare-models.ts` pin JUDGE_MODEL instead of judging with the model under test?",
    "options": [
      "Cost — the flagship judge is cheaper than running three judges",
      "Because a moved score would then have two possible causes and you could not tell them apart",
      "Because cheaper models cannot produce structured output"
    ],
    "answer": 1,
    "explain": "If the ruler changes at the same time as the thing being measured, a difference in the result is unattributable: did the tier get worse, or did the grader get more lenient? Pinning the judge makes the comparison single-variable. The run prints both the judge id and a hash of the judge prompt so that two runs graded differently can be detected rather than silently compared. Option 3 is false — all three tiers produce valid structured output; that was checked before this lab was written.",
    "note": "The same discipline applies to the gold set: change the cases or change the model, never both at once."
  }
]
```

## Step 4 — route before the call

Read [`src/lib/route-model.ts`](../../src/lib/route-model.ts). `pickModel`
inspects the message before spending anything: high-stakes language goes to the
flagship, short messages go to the cheap tier, everything else lands in the
middle.

```bash
curl -s 'localhost:8787/v1/triage?tier=auto' -H 'content-type: application/json' \
  -d '{"message":"Where is my package NW-51907?"}' | jq '.meta.routed'
```

```bash
curl -s 'localhost:8787/v1/triage?tier=auto' -H 'content-type: application/json' \
  -d '{"message":"The bottle lining flaked and my kid swallowed a bit of plastic, probably nothing."}' | jq '.meta.routed'
```

The second one routes to the flagship on the word "swallowed" and never asks a
cheap model for an opinion. That is the mechanism that actually protects
`eval-04`, and notice that it works *because it never consults the model whose
confidence you cannot trust*.

**Q4.** `pickModel` reads untrusted customer text to make its decision. Describe
the message that defeats it. Then say why the failure is quiet rather than loud.

## Step 5 — escalate after the call

```bash
curl -s 'localhost:8787/v1/triage?tier=auto&escalate=true' -H 'content-type: application/json' \
  -d '{"message":"i need a refund on order nw48211 and also my email on the account is wrong can you change it to dana.k@example.com"}' | jq '.meta'
```

Two passes. `meta.escalated` names the model that gave up and the confidence
that triggered it; `meta.usage` is the **sum** of both calls, and
`meta.usage_per_pass` itemizes them.

That summing is not bookkeeping fussiness. A two-pass route that reported only
the second pass would under-report its own cost by the price of the first
call — the same trap `/v1/resolve` documents for tool loops, arriving in a
different disguise.

**Q5.** Escalation fires on the cases the cheap model is unsure about. Step 3
established that on Haiku those are not reliably the cases it gets wrong. So
what is `?escalate=true` worth on the cheap tier, and on which tier is it
actually worth something?

## Step 6 — write the decision down

You have five numbers per tier and a matrix. Write three sentences: which model
you would ship for Northwind, what evidence supports it, and what single
observation would change your mind.

**Q6.** Two models score 11/12. Is that the same number?

**Q7.** Your three sentences almost certainly did not mention latency. Nothing
in Northwind's queue is waiting on a human — triage runs over tickets nobody
reads in real time — so say what the latency column is worth *here*. Then
change one thing about the product so that the same column becomes the
deciding number, and say which row you would ship then.

---

## Checkpoint

You should be able to answer, without looking anything up:

- [ ] Why does the disagreement matrix beat the accuracy column?
- [ ] What does a calibration gap near zero do to confidence-based routing?
- [ ] Why must the judge be pinned when the model under test varies?
- [ ] Where does `?tier=auto` read untrusted input, and what follows from that?
- [ ] Which tier silently loses prompt caching, and how would you have caught it from the cost column alone?

---

## Extension

The tone judge in this matrix is a **control**, not a per-tier comparison: it
grades `/v1/draft`, which uses the server's configured model regardless of
`--models`. Make it a real comparison. Thread a model override through the
draft route the way `?model=` was threaded through triage, then judge each
tier's prose with the pinned judge. Predict the result first — writing a
customer-facing paragraph is a very different task from classifying one, and
the tier ordering you measured for classification may not survive.

**Answers:** [../solutions/lab-7.md](../solutions/lab-7.md)
