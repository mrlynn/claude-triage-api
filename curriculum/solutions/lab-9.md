# Lab 9 — answers

**Q1. Half rate, higher bill. How?**

Because the batch discount and the prompt-cache discount apply to the same
tokens, and the cache one is much larger.

A cache read costs **0.1×** the input rate. The batch discount is **0.5×**. On
a request dominated by a ~3,400-token cached prefix, the synchronous path pays
`3400 × 0.1` and the batch path pays `3400 × 0.5` on any request that misses
the cache — five times more for the prefix, before the 50% has done anything.

The measurement: synchronous hit the cache **20/20**, batch **11/20**. Nine
requests paid full-rate-times-a-half for a prefix the synchronous run got for a
tenth. Net +23%.

Why the misses happen is structural rather than incidental. Synchronous
requests in a loop arrive close together, so the prefix written by the first is
warm for the rest. A batch is executed on the provider's schedule and fanned
out in parallel, so requests land whenever there is capacity and a warm prefix
is a matter of luck rather than sequence.

**The general form, which is the transferable part: two discounts on the same
tokens compete, they do not compose.** Anywhere you have stacked optimizations,
check whether the second one destroys the precondition of the first.

**Q2. When does batch clearly win?**

When the prefix is **small relative to the variable content**, or when requests
are **spaced far enough apart that the cache would be cold anyway**.

Concretely, batch wins when:

- Each request carries mostly unique content — long documents to summarize,
  distinct transcripts to extract from — so the cacheable fraction is small and
  there is little discount to lose.
- Requests are separated by more than the cache TTL (~5 minutes), so every
  request pays full rate under either scheme and the 50% is pure gain.
- You have no shared prefix at all.

Batch loses when a large stable prefix would otherwise stay warm — which is
exactly this repo's shape, and, worth noticing, exactly the shape of most
policy-grounded or RAG-style systems. That is a large and popular category to
be quietly wrong about.

Note the framing the question forces: **ticket volume is not the variable.**
Volume tells you the total bill; the prefix-to-variable ratio and the request
spacing tell you which mechanism is cheaper per ticket. People reach for batch
because the number of items is large, and the number of items is the one thing
that does not decide it.

**Q3. Does this apply to a 400,000-ticket one-time backfill?**

Probably not, and the reason is instructive: **the workload is different in a
way that flips the mechanism back.**

At 400,000 requests, a batch runs for hours with continuous fan-out. The prefix
gets written early and stays hot for the duration, so the cache-miss rate that
hurt twenty tickets should be far lower across four hundred thousand. The
misses in this lab are largely a small-N startup effect: eleven of twenty were
hits because the first few had to establish the prefix, and there was not enough
volume afterwards to amortise it.

What to measure before committing: **run a pilot batch of ~500 tickets and read
the cache-hit rate**, which `npm run triage:queue:batch` now reports. If it is
above ~90%, the discounts effectively do stack and batch wins outright. If it is
still near 55%, they do not, and you either stay synchronous or restructure the
prompt so the handbook is not on the cached path.

The habit worth taking: extrapolating a per-unit cost from twenty items to four
hundred thousand assumes the mechanism is scale-invariant. Caching is not. A
pilot costs a few dollars and answers it.

**Q4. Why wrap `fetch` rather than use `.withResponse()`?**

*Coverage.* The wrapper sees every call the client makes — `messages.parse`,
`.stream()`, each internal turn of the beta tool runner, `count_tokens`,
`batches.*`. Instrumenting at the call sites means instrumenting the ones
somebody remembered, and the tool runner's internal turns are not call sites you
have access to at all. A snapshot you only collect when you remember is a
snapshot you do not have on the day it matters.

*The bug.* `.withResponse()` does not exist at runtime on `messages.parse()`.
`parse()` is an SDK helper that returns a plain Promise, not the `APIPromise`
that carries `.withResponse()`. TypeScript accepted the call and it threw at
runtime — a signature that type-checks and does not exist. The lesson is not
about this method: it is that a type is a claim about an interface, and helpers
that wrap the transport can present a narrower one than the thing they wrap.
Execute the path before you rely on it.

There is a third reason worth naming: the routes stay unaware of it. Not one
handler mentions rate limits, so nobody has to remember the convention when
adding a fifth route.

**Q5. Why not add a second retry layer?**

Because retries multiply rather than add. Three SDK retries inside three of
ours is nine requests for one logical call, arriving in a burst against the
limit that just rejected you — the mechanism that is supposed to relieve
pressure becomes the thing applying it. This is the classic retry-storm shape,
and it is worse in an agent loop where a single user request already fans out
into several model calls.

The second problem is attribution. With two layers, neither is tunable: the
observed backoff is the product of two policies configured independently, and
changing one has effects you cannot predict from reading it.

What `AdaptiveGate` does instead is **backpressure, not retry**. It changes how
many requests are in flight, and leaves the fate of any individual request to
the SDK. One retry layer, one concurrency layer, clean separation. Halve on
failure and recover by one is additive-increase/multiplicative-decrease — TCP's
congestion control, for the same reason: shed load fast, reclaim it slowly. A
system that recovers as aggressively as it backs off oscillates between
hammering and hiding.

**Q6. Your eval drops two points on a Tuesday. Nothing deployed.**

First: **do not assume it is the model.** On a twelve-case set the run-to-run
spread is already two cases with nothing changed, so a two-point move is inside
the noise. That is the honest first answer and most investigations should stop
there.

If you want to actually establish it, in order:

1. **Re-run several times.** Five runs turn a point into a distribution, cost
   about $0.45, and settle most of these.
2. **Check which cases moved**, not how many. `eval:quick` prints
   `regressed:` and `newly passing:` by id. A drift in the model tends to move
   a *class* of cases; noise moves whichever case is marginal.
3. **Compare against the pinned id.** Run the same set against a dated snapshot
   and against the alias. If the pin scores as before and the alias does not,
   you have your answer, and it took one command.

**What you needed beforehand** is the part that matters:

- A **checked-in baseline** recording passing case ids, not just a count.
- A **dated pin** to compare against — you cannot retroactively obtain last
  month's model.
- A **scheduled run** so the drift shows up on a Monday in a job summary rather
  than in a Thursday incident. That is the `model-upgrade` cron.

None of that is buildable after the fact, which is the entire argument for
building it before you need it.

**Q7. Tool or resource?**

**If the client would be equally well served by reading the thing, it is a
resource. Tools are for work.**

`search_policy` does retrieval: it takes a query, ranks sections, returns a
computed subset. The client cannot produce that without calling us. The
handbook is content — it has a stable URI and it does not change per request.
Publishing it as a tool would mean a model had to invent a search query to
reach text it could simply have read, and would then get a *subset* chosen by
our ranking rather than the document.

A second test that often decides it: **does the answer depend on the arguments?**
If there are no meaningful arguments, you are probably describing a resource
with a function signature bolted on.

Examples of things commonly mis-modelled as tools: `get_current_config`,
`list_available_regions`, `fetch_pricing_table`, `get_user_preferences`. Each
is a stable document behind a verb. Modelling them as resources means a client
can read them once and cache them, instead of burning a tool call and a round
trip every time the model wonders.

Note also the middle case this repo splits: the handbook is published whole
*and* by section. A client that needs section 5 should not pay for all eight.

**Q8. Should `/v1/resolve` get an orchestrator?**

*For:* an orchestrator could decompose an unusual ticket into sub-questions,
run them in parallel, and synthesize. On a message raising three unrelated
issues it would plausibly do better than one linear loop, and it would extend
to tools nobody has written yet without changing the control flow.

*Against, and this is the answer:* the work is already bounded. There are three
tools and a known set of questions — what did they order, who are they, what
does policy say. `/v1/resolve` earns being an agent because the *order* of
lookups depends on earlier results, and that is the whole of the dynamism
present. An orchestrator would add a model call whose job is to plan work that
is already enumerable, buying latency and unpredictability in exchange for
flexibility this domain does not use.

It would also make the guardrails harder. `enforceAuthority` reads a flat tool
trace; a fan-out produces a tree, and "which sub-agent looked up the refund
total" becomes a question you have to answer before you can check the ceiling.
Complexity in the control flow propagates into the controls.

**What would change the answer:** if Northwind's tickets routinely raised
several independent issues needing genuinely different resolution paths — a
refund *and* a warranty claim *and* an account change, each with its own policy
and its own authority limit — then the linear loop starts serialising work that
has no reason to be serial, and the sub-tasks are no longer enumerable in
advance. Note that this is a claim about the *ticket distribution*, and it is
measurable: count the multi-intent tickets. `NW-T-1060` is one. If it were
thirty percent of the queue rather than one in twenty, the argument shifts.

**The meta-point, and the reason this question is last:** naming a pattern you
did not need is more useful than naming the three you did. The four patterns
are vocabulary, not a checklist, and the most common failure is reaching for the
most impressive one because it has a name.

## Extension notes

The question at the end is the real one. `AdaptiveGate` halves on failure and
recovers by one, so if the true limit sits just below your starting width, the
steady state is: run at width `w`, get a 429, drop to `w/2`, climb back one at a
time, get a 429 again. You spend most of your time below capacity and you take
a rejection on every climb.

Three fixes, in increasing sophistication:

1. **Remember the last width that failed** and stop recovering one below it,
   which is TCP's slow-start threshold. Cheap and effective.
2. **Recover on a timer rather than per batch**, so a long clean run widens and
   a short one does not.
3. **Read `anthropic-ratelimit-requests-remaining` and set the width from it
   directly** rather than discovering the limit by hitting it. You already have
   the header — `readRateLimitHeaders` parses it — and probing a limit you were
   told about is the kind of thing that looks sophisticated and is not.

Option 3 is the one most teams skip, and it is the cheapest.
