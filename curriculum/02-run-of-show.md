# Run of show

Minute-by-minute for a two-day delivery. The
[instructor guide](01-instructor-guide.md) covers what learners get wrong and
why each lab exists; this page covers what you do and when.

Written to be followed by someone who did not build the repo.

---

## Before the room arrives

**Two days out**

- [ ] Send [`setup.md`](setup.md). The pre-flight checklist is in the
      [instructor guide](01-instructor-guide.md#pre-flight-send-48-hours-ahead).
- [ ] Provision workspaces and issue keys —
      [`docs/facilitator/keys.md`](../docs/facilitator/keys.md). Keys cannot be
      created programmatically, so budget ten minutes for a room of 30.
- [ ] `npm run workshop -- status --label <label>` and confirm it is clean.
- [ ] If you ran a session yesterday, clear the escalation queue so the board
      starts empty: open [the queue][q] with your token and use **Clear the
      queue**. It deletes real submissions and is not recoverable; usage
      telemetry on `/ops` is unaffected.

**The morning of**

- [ ] `npm run smoke` on the projector machine. It asserts now, so a green run
      means the key works, the cache is warm, and the guardrails are wired.
- [ ] **Pre-warm the cache.** The first call of the day pays a cache write and
      looks slow. Running `smoke` once does this for the projector; learners
      each pay their own first write in Lab 0, which is fine and is worth
      naming when someone asks why their first call took six seconds.
- [ ] Open these tabs: the [storefront support form][sf], the
      [injection playground][inj], the [queue][q] with your `QUEUE_TOKEN`
      already exchanged (it is readable without one, but you want the live
      board), and [`/ops`][ops].
- [ ] Submit one safety ticket on the support form now, so the queue has
      something in it when you demo it on Day 2 and you are not typing into
      silence.

[sf]: https://northwind.mlynn.dev/support
[inj]: https://northwind.mlynn.dev/playground/injection
[q]: https://northwind.mlynn.dev/queue
[ops]: https://northwind.mlynn.dev/ops

---

## Day 1 — the capability spine

Six and a half hours including lunch and two breaks.

**This day stands alone.** If the room only has one day, run this one and stop.
Nothing here is scaffolding for Day 2 that goes to waste without it.

| Time | Segment | Notes |
|---|---|---|
| 0:00–0:20 | **The scenario** | Read [`scenario.md`](scenario.md) beats aloud. The October 2025 incident is the spine of the whole course — spend the time. |
| 0:20–0:35 | **Concept map** | Everything is one endpoint. Four capabilities are four parameters. |
| 0:35–0:55 | **Lab 0** | Not optional. See below. |
| 0:55–1:15 | Lab 1 | |
| 1:15–1:50 | Lab 2 | The conceptual spine. Never cut. |
| 1:50–2:00 | Break | |
| 2:00–2:45 | Lab 3 | Runs long. See below. |
| 2:45–3:15 | Lab 4 | |
| 3:15–4:00 | Lunch | |
| 4:00–4:35 | Lab 5 | |
| 4:35–5:20 | Lab 6 | |
| 5:20–5:30 | Break | |
| 5:30–6:00 | Architecture walkthrough | `docs/architecture.md`, ending on the omissions list. |
| 6:00–6:30 | Assessment + close | |

### Lab 0 (0:35–0:55) — the beat that sets up the whole course

The temptation is to let people run the command. Do not.

1. **Two minutes, silent.** Everyone hand-labels `NW-T-1045`, `NW-T-1047`,
   `NW-T-1060` on paper. No laptops.
2. **Compare with a neighbour.** Most rooms disagree on `NW-T-1060`.
3. **Ask why.** The disagreement is about the *schema*, not the ticket — it is
   a multi-intent message against a single-label field. That reframe is what
   makes Lab 2 land, and you get it for free in minute forty.
4. *Then* run `npm run eval:quick`, and `-- --save` to record the baseline.

If you skip the paper step, Lab 0 becomes a command demo and Labs 2 and 6 lose
their setup.

### Lab 3 (2:00–2:45) — where every room falls behind

The tool loop is the first genuinely fiddly thing. Two mitigations:

- Have the `curl` for Step 3 on screen ready to paste. Typing it live costs
  four minutes and produces a typo.
- If you are at 2:35 and Step 3 is not done, cut the extensions and move. Lab 4
  does not depend on them.

---

## Day 2 — production

Four hours ten, and **optional**. Book it when the room has a project rather than a
curiosity — these are the decisions that only arrive once something is real.
Assumes Day 1's baseline exists; every measurement is a comparison against it.

| Time | Segment | Notes |
|---|---|---|
| 0:00–0:10 | Recap | Put yesterday's `evals/baseline.json` on screen. |
| 0:10–0:55 | **Lab 7** | Model choice. |
| 0:55–1:05 | Break | |
| 1:05–2:05 | **Lab 8** | The trust boundary. Step 6 is the one to cut. |
| 2:05–2:20 | **Live demo** | The queue. See below. |
| 2:20–3:20 | **Lab 9** | Shipping it. Longest lab. |
| 3:20–3:30 | Break | |
| 3:30–4:00 | Patterns + what we left out | Lab 9 Q9, then the omissions list. |
| 4:00–4:10 | Where to go next | Hand out **Lab 10**. See below. |

### The capstone (Lab 10) — assign it, or run it if you have the room

[Lab 10](labs/lab-10-ask-northwind.md) is 45 minutes and it is not in either
day's table on purpose. Its subject is already deployed on both public sites,
so it needs no key, no local service, and no terminal — which makes it the one
thing on this course you can hand to a room whose keys you already revoked.

**If you are sending it home,** spend two minutes at 4:00 doing step 3 on the
projector so they know what they are going to. Ask for a $900 refund in the
storefront assistant. It comes back an escalation. Ask the room why, and let
them say "the model followed policy" before you tell them `underAuthority`
rewrote the outcome — Lab 8's `enforceAuthority` move, arriving where the model
was being *persuasive* rather than merely attacked.

**If you have a spare 45 minutes,** run the five Check-your-work steps in order
and stop hard on two beats:

1. *"Which of its four tools files the ticket?"* None of them. The confirmation
   is the write, and it re-derives authority on the confirming request, because
   a stored proposal is not evidence it was ever within policy.
2. The Agent SDK argument. An earlier version of this assistant ran the SDK with
   `tools: []`, `settingSources: []` and memory off — every reason to use it,
   switched off — and what remained was `messages.toolRunner`. Ask what would
   have to change about this assistant to flip that call. "A filesystem," "a
   shell," or "memory across sessions" are the right answers.

Cost is **$0 per learner**: the storefront pays, and it is rate-limited and
spend-capped.

### Lab 7 — the two beats that matter

- **Make someone say the budget out loud.** $137/month against $4,000. Cost is
  not the binding constraint, and the whole room arrived assuming it was.
- **Put the `eval-04` row on screen.** Haiku returns the wrong answer on the
  child-swallowed-plastic case at **0.95 confidence**. One cell, and it makes
  the calibration argument better than any explanation.

### Lab 8 — the beat that matters

When the red-team gate goes green, do not move on. Show them
`data/injections.jsonl` and the case notes recording that **eight of the nine
failures during development were mis-specified assertions, not model failures** —
one literally inverted. That is Lab 0's "check the label before the model"
arriving where it is much easier to mistake a broken test for a broken defence.

### Live demo (2:05–2:20) — the queue

Five minutes, and it lands better than any slide about human-in-the-loop.

1. Submit a casually worded injury report on the [support form][sf] — *"the
   bottle lining flaked and my kid swallowed a bit, probably nothing."* That is
   the October 2025 incident, typed live.
2. Watch the pipeline reach `persist` and return a ticket id. Point out that a
   routine ticket produces **no id at all**: storage is a consequence of
   escalation, not of submission.
3. Open the [queue][q]. It is public and read-only by default, showing the
   course's seven fictional escalations — so learners can follow along on
   their own laptops rather than watching yours. Your `QUEUE_TOKEN` cookie
   swaps that for the real submissions and enables Claim and Resolve. Work
   the ticket you just filed.
4. Open [`/ops`][ops]. The escalation panel is the only figure on that dashboard
   read from a database; everything below is invented history, and both are
   badged. Ask which they would put in a board deck.

### Lab 9 — do not spoil Step 1

The whole room believes batch is half price. Let them run all three commands
and read the table before you say anything. Batch came out **slowest and 23%
more expensive**, because a cache read is 90% off and the batch discount is 50%
off and the two compete.

Then immediately guard against the overcorrection: at 400,000 tickets the
prefix stays hot for hours and it probably flips back. The lesson is *measure*,
not *avoid*. That is Lab 9 Q3 and it matters as much as the result.

Have Claude Desktop or Claude Code pre-configured against `npm run mcp` on the
projector, or Step 6 becomes reading a file.

---

## If someone asks about Python

There is a parallel implementation of `/v1/triage` and the scoreboard under
`python/`, and [a deltas page](../python/labs/deltas.md) covering the four
things that genuinely differ.

Do not send them off to run it mid-lab. It costs the same per run as the
TypeScript harness, it puts one person on a different runtime while you are
debugging everyone else's, and the deltas are better read than discovered. Give
them the page at a break or at the close.

The one worth mentioning out loud, because it lands for everybody regardless of
language: the first port paraphrased the schema field descriptions instead of
copying them, dropping one clause from `requires_human`. Everything
type-checked and ran, and accuracy went 11/12 to 8/12. Restoring one sentence
restored the score. That is Lab 2's whole thesis, reproduced in a context where
the mistake is much easier to make.

---

## If you are running behind

In the order you should cut:

1. Lab 3 extensions
2. Lab 4 Steps 5–6
3. Lab 8 Step 6 (citation verification) — the only step in that lab with no
   deterministic control to demonstrate live, and it reads well cold
4. Lab 9 Step 7 (the patterns exercise) — valuable, but it is discussion and
   discussion compresses
5. The architecture walkthrough, down to just the omissions list

**Never cut:** Lab 0 (the baseline everything else compares against), Lab 2
(the conceptual spine), or Lab 8 Step 5 (measuring what the hardening cost —
without it the lab is security theatre).

---

## Costs and shared keys

Per learner: **~$1.50 Day 1, ~$2.50 Day 2**, measured. Full table and the
argument for a 3× cap in
[`docs/facilitator/keys.md`](../docs/facilitator/keys.md).

On a shared key, run `eval:redteam` and Lab 9 Step 1 once on the projector —
about $0.95 of the $4.00 between them, and both are better watched together
anyway. Point the room at the [model matrix][mm] and [batch planner][bp], which
render checked-in results from real runs.

[mm]: https://triage.mlynn.dev/playground/models
[bp]: https://triage.mlynn.dev/playground/batch

---

## After

- [ ] `npm run workshop -- teardown --label <label> --apply`. **This is the
      step that gets forgotten.** Nobody forgets to hand out keys; everybody
      forgets to revoke thirty of them.
- [ ] `npm run workshop -- status --label <label>` to confirm nothing is
      outstanding.
- [ ] Note which labs ran long and correct this page. It is only as good as the
      last delivery that edited it.
