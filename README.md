# Claude Triage API

A reference implementation of a customer-support triage service built on the
Claude API — written to be **read and taught from**, not just run.

Four routes, four capabilities, one coherent domain. Each route introduces
exactly one new idea and builds on the one before it.

**Start with [the scenario](curriculum/scenario.md).** The domain is a real
company with a real problem: 4,100 support tickets a week, manual triage as the
bottleneck, two failed automation attempts, and an incident where a child's
injury report sat unrouted for three days because it opened with "probably
nothing." Every design decision in this repo traces back to something on that
page, and the labs are much harder to motivate without it.

| Route | Capability | The idea it teaches |
|---|---|---|
| `POST /v1/triage` | Structured outputs | The model's output contract *is* your type system |
| `POST /v1/resolve` | Tool use | Claude queries your systems and shows its work |
| `POST /v1/draft` | Streaming | Token-by-token delivery over SSE, with real cost accounting |
| `POST /v1/estimate` | Token counting | Know the bill before you pay it |

Cross-cutting, demonstrated throughout: **prompt caching** (a ~1,400-word
policy handbook cached across every request), **usage and cost accounting**,
**typed error handling**, and an **eval harness** with both deterministic
scoring and an LLM judge.

---

## Quickstart

Full setup, prerequisites, and troubleshooting:
[`curriculum/setup.md`](curriculum/setup.md). The short version:

```bash
npm install
```

```bash
cp .env.example .env
```

Put your key in `.env` (get one at
[console.anthropic.com](https://console.anthropic.com/settings/keys)), then:

```bash
npm run smoke
```

`.env` and `.env.local` are loaded automatically by
[`src/lib/env.ts`](src/lib/env.ts) — no dotenv dependency, and a real shell
variable always wins over the file.

`npm run smoke` exercises all four routes in-process and prints the prompt-cache
hit on the second call. It costs about **$0.10**.

To run the service:

```bash
npm run dev
```

```bash
curl -s localhost:8787/v1/triage -H 'content-type: application/json' -d '{
  "message": "Order NW-48211 arrived Monday and the zipper separated the second time I wore it. I want a replacement."
}' | jq
```

---

## What each route actually does

### `POST /v1/triage` — structured outputs

Classifies an inbound message into a validated schema: category, urgency,
sentiment, extracted entities, escalation flag, and a calibrated confidence
score.

The point: there is no `JSON.parse` in a `try/catch`, no "respond only with
JSON" in the prompt, and no repair loop. One Zod schema
([`src/schemas.ts`](src/schemas.ts)) is simultaneously the model's output
constraint, the runtime validator, and the TypeScript type your consumers get.

```jsonc
{
  "triage": {
    "category": "product_defect",
    "urgency": "normal",
    "sentiment": "frustrated",
    "summary": "Jacket zipper separated on second wear; wants a replacement.",
    "entities": {
      "order_ids": ["NW-48211"],
      "product_names": ["Ridgeline 3L Shell Jacket"],
      "requested_remedy": "replacement"
    },
    "requires_human": false,
    "escalation_reason": null,
    "confidence": 0.92
  },
  "meta": { "usage": { "cache_hit": true, "estimated_cost_usd": 0.0041, "...": "..." } }
}
```

### `POST /v1/resolve` — tool use

Gives Claude three tools over a fake back office — `lookup_order`,
`lookup_customer`, `search_policy` — and lets it decide what to call, in what
order, and when it has enough to act. Returns the decision *and* the full tool
trace.

Production details this route does not skip:

- **`max_iterations` is capped.** An uncapped agent loop is an uncapped bill.
- **Usage is summed across every turn.** The final message's `usage` covers only
  the final request; reporting it alone under-reports a 5-turn loop by ~5×.
- **The tool trace is returned.** In support tooling, "show your work" is an
  audit requirement.

### `POST /v1/draft` — streaming

Streams a customer-ready reply over Server-Sent Events. Emits three event types:
`text` (reply body), `thinking` (summarized reasoning, for a collapsed UI
panel), and a terminal `done` carrying `stop_reason` and full cost.

Two things most streaming demos get wrong and this one doesn't: usage arrives
only at the end (via `finalMessage()`), and a client disconnect must abort the
upstream stream or you keep paying for tokens nobody will read.

### `POST /v1/estimate` — token counting

Counts tokens server-side with the real tokenizer and projects monthly cost at
a given volume, cached and uncached. No inference, so it's free.

It also reports `prefix_meets_cache_minimum` — below ~1024 tokens the API
silently declines to cache, with no error.

---

## Evals

```bash
npm run eval
```

Two measurements, because they answer different questions:

1. **Deterministic scoring** against a 12-case hand-labelled gold set
   ([`evals/dataset.jsonl`](evals/dataset.jsonl)). Exits non-zero below 80%
   accuracy, so it works as a CI gate. Also reports confidence calibration —
   if failures score as confidently as passes, the confidence field is
   decoration.
2. **LLM-as-judge** on generated replies, scoring tone compliance against a
   six-item rubric with required evidence-before-verdict.

A full run costs about **$0.20**. The gold set is small (12 cases) on purpose:
big enough to catch a real regression, small enough that hand-labelling stays
honest. One case is 8% of the score, which is itself a lesson — see
[Lab 6](curriculum/labs/lab-6-evals.md) Q7.

---

## Measured behavior

From an actual run against `claude-opus-5` (your numbers will vary slightly):

**Prompt caching** — two identical-prefix calls to `/v1/triage`:

| | call 1 (cold) | call 2 (warm) |
|---|---|---|
| `cache_creation_input_tokens` | 4,711 | 0 |
| `cache_read_input_tokens` | 0 | 4,711 |
| `input_tokens` (fresh) | 112 | 112 |
| estimated cost | $0.0334 | $0.0063 |

**81% cheaper on the warm call.** Note that the cold call costs *more* than no
caching at all ($0.0334 vs $0.0275) — the write premium. Caching one-shot
prefixes loses money; see [Lab 5](curriculum/labs/lab-5-prompt-caching.md) Q5.

**Tool loop** — `/v1/resolve` on a defective-jacket ticket resolved in 3
iterations, calling `lookup_order → lookup_customer → search_policy →
search_policy`, and cited clauses 2.2, 2.4, 2.5, and 6.3 — including 6.3
("do not offer a discount before the problem is fixed"), which is the clause
that stops it from leading with a goodwill code.

**Judge variance** — three eval runs scored the tone judge at 3/4, 1/4, and
2/4 on a four-case sample. Same route, same rubric, same model. A metric with
that spread cannot detect a real change of any plausible size, which is exactly
why [Lab 6](curriculum/labs/lab-6-evals.md) Q1 gates CI on the deterministic
half and not the judge.

The judge still earned its keep, because *what* it flagged was consistent and
correct even though *how many* it flagged was not. It caught the drafter prompt
promising an immediate refund, which handbook clause 2.3 forbids — the prompt
had restated section 1's tone rules but left clause 2.3 unrestated in the
handbook text, and the model did not find it under pressure. Fixed in
[src/prompts.ts](src/prompts.ts) by hoisting the hard constraints into the role
instructions, plus two later findings (opening with a pleasantry instead of the
resolution; "process that refund today" reading as immediate).

**The stopping decision is part of the demo.** After those fixes I did *not*
re-run to show an improved pass rate. At n=4 with a 50-point spread, any number
I produced would be noise dressed as evidence, and tuning a prompt until a
noisy judge agrees is how you overfit to your own metric. The defensible claim
is the narrow one: the judge's own rationale on `eval-03` now credits the reply
for stating the 5-7 business day timeline, which is the specific behavior the
fix targeted. Validating the *rate* needs a bigger sample — see
[Lab 6](curriculum/labs/lab-6-evals.md) Q7.

**Eval** — 11/12 and 12/12 across two runs. The only case that flips is
`eval-11`, the one labelled *deliberately ambiguous* — and it scored **0.45–0.50**
confidence both times, against a mean of **~0.84** on the cases that pass.

That is the calibration instruction in `TriageSchema` doing its job: the model
is not merely wrong sometimes, it is **wrong exactly where it reports being
unsure**. A confidence field with that property supports threshold routing; one
that reports 0.9 on everything does not. See
[Lab 2](curriculum/labs/lab-2-structured-outputs.md) Step 2.

It also means a 12-case set cannot resolve a difference smaller than 8%. Sizing
the set is [Lab 6](curriculum/labs/lab-6-evals.md) Q7.

---

## Layout

```
src/
  config.ts          model id, per-route effort, max_tokens, pricing
  anthropic.ts       the single shared client
  schemas.ts         Zod schemas — output contract AND API types
  prompts.ts         system prompt assembly with cache breakpoints
  routes/            one file per capability
  tools/             tool definitions + the fake back office
  lib/               usage accounting, error mapping, SSE
data/
  policies.md        the ~1,400-word handbook that gets cached
  orders.json        fake OMS
  customers.json     fake CRM
evals/               gold set + harness (deterministic + LLM judge)
curriculum/          labs, instructor guide, concept map, assessment
docs/architecture.md the design decisions and why
```

---

## Curriculum

This repo doubles as a hands-on course. Read
[`curriculum/scenario.md`](curriculum/scenario.md) for the domain, follow
[`curriculum/setup.md`](curriculum/setup.md) to get running, then
[`curriculum/00-concept-map.md`](curriculum/00-concept-map.md) for the technical
map.

| Lab | Topic | Time |
|---|---|---|
| [1](curriculum/labs/lab-1-first-call.md) | Your first call, and reading `usage` | 20 min |
| [2](curriculum/labs/lab-2-structured-outputs.md) | Structured outputs and schema design | 35 min |
| [3](curriculum/labs/lab-3-tool-use.md) | Tool use and the agentic loop | 45 min |
| [4](curriculum/labs/lab-4-streaming.md) | Streaming and SSE | 30 min |
| [5](curriculum/labs/lab-5-prompt-caching.md) | Prompt caching and cost | 35 min |
| [6](curriculum/labs/lab-6-evals.md) | Evals and LLM-as-judge | 45 min |

Instructors: [`curriculum/01-instructor-guide.md`](curriculum/01-instructor-guide.md)
has timing, the failure modes learners hit, and what to do when a lab goes
sideways. Solutions are in [`curriculum/solutions/`](curriculum/solutions/).

---

## Notes on model and API choices

- **Model:** `claude-opus-5`. Set `TRIAGE_MODEL` to override.
- **Thinking:** adaptive. `budget_tokens` is removed on this model family and
  returns a 400 — the replacement is `output_config.effort`.
- **Effort varies per route** (`low` for triage, `high` for resolve, `medium`
  for draft) and lives in [`src/config.ts`](src/config.ts) so the cost/quality
  tradeoff is a one-line experiment, not a scavenger hunt.
- **Pricing** in `config.ts` is Claude Opus 5 list price at time of writing.
  Verify against [current pricing](https://claude.com/pricing) before quoting
  numbers to anyone.
