# Lab 5 — answers

**Q1. What is each field counting?**

- `input_tokens` — fresh, uncached input, billed at full rate. Small on both
  calls here because it is only the volatile block and the user message.
- `cache_creation_input_tokens` — tokens written to the cache on the first
  call, billed at ~1.25×.
- `cache_read_input_tokens` — tokens served from cache on the second call,
  billed at ~0.1×.

Worked example, using a 1,900-token prefix at $5/M input (substitute the
actual figure your `npm run smoke` reports): writing costs about
`1900 × 5/1e6 × 1.25 ≈ $0.0119`; reading costs about
`1900 × 5/1e6 × 0.1 ≈ $0.00095`. Roughly a 12× reduction on the prefix, and
the write pays for itself after about two subsequent reads.

**Q2. The four breaks.**

| Break | `cache_hit`? | Error? | Notes |
|---|---|---|---|
| A — timestamp in prefix | false, always | none | The prefix differs every request; nothing is ever reusable |
| B — breakpoint on volatile block | false | none | The prefix now includes varying content, so it never matches |
| C — 350-token prefix | false | none | Below the ~1024-token minimum; the API silently declines |
| D — reordered tools | false | none | Tools render *before* system; reordering changes the prefix |

**A is the most dangerous in production**, because it is the most likely to be
introduced by a well-meaning change ("let's tell the model today's date") and
the least likely to be caught in review. B and D at least look structural when
you read the diff; C usually shows up during development. A looks harmless.

None of the four produce an error. All four produce correct answers at roughly
10× the intended cost.

**Q3. What happens below 1024 tokens?**

Silence. Not an error, not a warning, not a header — the `cache_control` marker
is simply ignored and `cache_creation_input_tokens` stays 0.

The implication: **you cannot validate a caching change by reading the code or
by checking that the request succeeded.** You must make two identical requests
and assert that the second reports non-zero `cache_read_input_tokens`. That
assertion belongs in your test suite, and the metric belongs on a dashboard.

**Q4. Breakpoint placement.**

Order most-stable to least-stable, which for the given categories is:

```
1. product catalog (40K, global)        ── breakpoint 1
2. per-tenant policy override (3K)      ── breakpoint 2
3. conversation history (growing)       ── breakpoint 3 (move it each turn)
4. current user message                 ── nothing after
```

The current user message must come last: it is unique to every request, so
anything after a breakpoint that includes it can never be reused.

Putting the growing history *before* the per-tenant block is expensive because
the history changes every turn — so the tenant block, which sits behind it in
the prefix, gets invalidated on every turn too. You would pay full price for
3K tokens on every request that should have been a cache read. **Order by rate
of change, not by logical grouping.**

**Q5. When does caching lose money?**

A write costs ~1.25× and a read ~0.1×, against 1.0× uncached. Over a TTL window
with one write and *n* reads:

```
cached   = 1.25 + 0.1n
uncached = 1 + n
```

These are equal at `n = 0.25/0.9 ≈ 0.28`. So caching wins as soon as you get
**one additional request against the same prefix within the TTL window** — a
single reuse already pays for it. With zero reuse (`n = 0`) you pay 1.25× for
nothing, a 25% penalty.

The 5-minute default TTL is what makes this real: the question is not "do I get
reuse?" but "do I get reuse *within five minutes?*"

A support-domain pattern where you would not cache: a low-volume tenant on a
per-tenant prefix receiving a handful of tickets a day. Each request arrives
cold, pays the 25% write premium, and the entry expires unused. Either don't
cache that tenant, or restructure so the cached prefix is the *global* handbook
shared across all tenants — which is exactly what this repo does.

**Q6. Effort low vs. high.**

Typically accuracy is unchanged or within noise on this gold set, while cost
rises noticeably. What that tells you: **triage is not a reasoning-limited
task.** The failures that remain are label ambiguity and prompt gaps, not
insufficient thinking — so more thinking cannot fix them.

Before spending the extra tokens you would want to see a *specific* class of
failure that deeper reasoning plausibly addresses (multi-hop policy reasoning,
say) and a measurable accuracy gain on cases in that class. "Higher effort
feels safer" is not a reason. Note also that a 12-case set is too small to
resolve a small real difference — a 1-case swing is 8%. Sizing the eval set is
part of the answer.

---

## Extension notes

The alert rule is not "hit rate < 100%." Cold starts, deploys, and TTL expiry
all produce legitimate misses. Two rules that work:

- **Rate-of-change:** hit rate drops more than 30 points week-over-week with no
  deploy. Catches a slow invalidator creeping in.
- **Absolute floor tied to traffic:** on a route receiving more than N requests
  per TTL window, hit rate below ~50% means something structural is wrong.

The genuinely diagnostic signal is `cache_creation_input_tokens` staying high
while `cache_read_input_tokens` stays at zero — that is a prefix being written
over and over and never matched, which is the unmistakable signature of a
varying prefix.
