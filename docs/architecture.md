# Architecture and design decisions

This document explains *why* the code looks the way it does. It is the
companion to the inline comments, which explain *what* each piece does.

---

## The shape of the system

```
                      ┌──────────────────────────────────────┐
   HTTP request  ───▶ │  Hono router (src/server.ts)         │
                      └───────────────┬──────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
     ┌─────────────────┐   ┌──────────────────┐   ┌────────────────────┐
     │ /v1/triage      │   │ /v1/resolve      │   │ /v1/draft          │
     │ messages.parse  │   │ beta.toolRunner  │   │ messages.stream    │
     │ + output_config │   │ + 3 Zod tools    │   │ + SSE              │
     └────────┬────────┘   └─────────┬────────┘   └─────────┬──────────┘
              │                      │                      │
              └──────────────────────┼──────────────────────┘
                                     ▼
                    ┌─────────────────────────────────┐
                    │ src/prompts.ts                  │
                    │  block 0: role + handbook       │  ◀── cache_control
                    │  block 1: date, channel, email  │      breakpoint
                    └────────────────┬────────────────┘
                                     ▼
                              Claude API (Opus 5)
```

Every route shares one prompt assembler, one client, one usage accountant, and
one error mapper. That sharing is deliberate: it means a lab exercise that
changes caching behavior changes it everywhere at once, and the learner sees
the effect on three different call patterns from one edit.

---

## Decision 1 — one Zod schema, three jobs

`src/schemas.ts` defines `TriageSchema` once. It is then used as:

1. the model's output constraint, via `zodOutputFormat()` into
   `output_config.format`;
2. the runtime validator, via `messages.parse()`;
3. the TypeScript type handed to HTTP consumers, via `z.infer`.

**Why this matters.** The most common way teams get burned by LLM JSON is a
three-layer duplication: a prompt that describes the shape in prose, a
hand-written TypeScript interface, and a parser that repairs malformed output.
Those three drift. Adding a field means editing all three, and forgetting one
produces a bug that only appears on 2% of traffic.

Constrained generation removes the drift by construction. The prompt does not
describe the shape at all — it describes the *semantics* (what "urgent" means,
how to calibrate confidence). The shape is enforced by the API.

**The `.describe()` calls are not documentation.** They are compiled into the
JSON Schema the model receives and are the primary lever for steering a field.
Compare:

```ts
confidence: z.number().min(0).max(1)
```

```ts
confidence: z.number().min(0).max(1).describe(
  "Your calibrated confidence. Use the full range — a genuinely ambiguous " +
  "ticket should score near 0.5, not 0.9."
)
```

The first yields a field that clusters at 0.9 and carries no information. The
second yields a field you can threshold on. Lab 2 has learners measure this.

---

## Decision 2 — the prompt is split for cache stability

Prompt caching is a **prefix match**. The API renders a request as
`tools → system → messages`, and a cache hit requires a byte-identical prefix
up to the breakpoint. Any variation anywhere before the breakpoint invalidates
everything after it.

So `buildSystem()` returns two blocks:

| Block | Contents | Varies? | Cached? |
|---|---|---|---|
| 0 | role instructions + full policy handbook | never | yes — breakpoint here |
| 1 | current date, channel, customer email | every request | no |

The single most common cache bug in production is a timestamp in the system
prompt:

```ts
// Silently destroys the cache on every single request.
system: `Today is ${new Date().toISOString()}\n${POLICY_HANDBOOK}`
```

There is no error. The request succeeds. `cache_read_input_tokens` is just
always zero, and the bill is ~10× what it should be. `src/prompts.ts` is the
only file in this repo permitted to call `new Date()`, and it does so strictly
after the breakpoint.

**Three properties the cache demands, and how the code guarantees them:**

- *Stable text.* Role strings are module-level constants, not template literals
  built per request.
- *Stable order.* Tools are constructed in a fixed order in `createTools()`;
  reordering a tool array is another silent invalidator.
- *Sufficient length.* The prefix must clear ~1024 tokens or the API declines
  to cache with no error. `/v1/estimate` reports
  `prefix_meets_cache_minimum` so this is measurable, not assumed.

Each of the three roles maintains its own cache entry, because the role text is
part of the prefix. That is the correct tradeoff here: three warm entries beat
one entry that thrashes.

---

## Decision 3 — usage is summed, never sampled

`src/lib/usage.ts` exists because `usage` has four fields and the naive reading
of it is wrong:

```
input_tokens                  uncached input       full rate
cache_creation_input_tokens   written to cache     ~1.25×
cache_read_input_tokens       served from cache    ~0.1×
output_tokens                 generated            output rate
```

"Total input" is the sum of the first three. A dashboard that graphs
`input_tokens` alone on a cached workload shows costs collapsing toward zero —
and will not alert you when the cache breaks, because a broken cache moves
tokens *into* the field you're graphing.

The agentic route compounds this. `/v1/resolve` iterates the tool runner rather
than simply awaiting it, specifically so it can capture `usage` on every turn.
Awaiting the runner directly returns the final message, whose `usage` describes
only the final request. On a five-turn loop that under-reports by roughly 5×.

---

## Decision 4 — tool descriptions are prompts

`src/tools/index.ts` treats each tool's `description` as prompt real estate,
because it is the only documentation Claude ever sees about that tool.

Three rules the tools follow:

1. **Say when to call it, not just what it does.** "Call this before stating
   any fact about an order — never rely on what the customer claims" produces
   different behavior than "Looks up an order."
2. **Return small, structured, self-describing results.** `lookup_order`
   returns computed `days_since_delivery` rather than making the model do date
   arithmetic on a raw ISO string. Moving deterministic work out of the model
   is nearly always the right call.
3. **Make failure legible.** `{ found: false, order_id }` teaches the model
   what happened and what to do next. A thrown exception or an empty string
   teaches it nothing and invites a hallucinated order.

`run()` must return a string (or content blocks) — returning a bare object is a
type error. That constraint is a feature: it forces you to make serialization
an explicit decision, since what you serialize *is* what the model reads.

---

## Decision 5 — errors are a chain, and streaming errors are in-band

`src/lib/errors.ts` catches most-specific-first and maps to HTTP with an
explicit `retryable` flag. The distinction that matters to a caller is
retryable (429, 5xx, connection) versus not (400, 401, 404). Collapsing them
into `catch (e) { 500 }` means clients cannot back off correctly and on-call
cannot tell an outage from a malformed request.

One subtlety specific to `/v1/draft`: once streaming starts, the HTTP status is
already 200. An upstream failure mid-stream cannot be expressed as a non-2xx
response, so it is emitted as an in-band `error` event. **Any client consuming
this route must handle an `error` event, not just a non-2xx status.** This is
the single most commonly missed piece of streaming integration.

Note also that `AuthenticationError` maps to **500**, not 401. The caller's
credentials are not the problem — ours are. Forwarding upstream auth failures
as 401 tells the client to fix a key they don't have.

---

## Decision 6 — effort is per-route and lives in one file

`config.ts` sets `effort` to `low` for triage, `high` for resolve, `medium` for
draft. On this model family `effort` replaces the removed `budget_tokens` and
controls thinking depth and total token spend.

Triage is a bounded classification on the hot path — it does not need deep
reasoning and it runs on every inbound message. Resolve chains multiple lookups
against policy and is where a wrong answer costs real money. Putting these in
one constant makes "what does quality cost here?" a one-line diff, which is
exactly the experiment Lab 5 asks learners to run.

---

## What this reference deliberately omits

Being explicit about scope is part of being teachable. Not here:

- **Persistence.** No database. Conversations are single-turn by design so the
  labs stay about the API, not about session storage.
- **Auth on the service itself.** There is no API key on our own endpoints.
  Anything internet-facing needs one.
- **Retry orchestration beyond the SDK's.** `maxRetries: 3` covers transient
  failures; a real deployment adds a queue for the rest.
- **PII handling.** Policy clause 4.5 says card digits must be redacted. The
  code does not do it. That gap is intentional and is the subject of an
  extension exercise in Lab 3.
- **Batch processing.** For an offline backfill of a ticket archive, the
  Batches API halves the cost. Out of scope for a synchronous service; called
  out here so nobody assumes this is the only shape.
