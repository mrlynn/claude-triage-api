# PRD — Free trial credit, bring-your-own-key, and a visible meter

**Status:** Implemented, behind `BYOK_MODE` (default `off`) · **Owner:** Michael Lynn · **Spec:** [SPEC.md](SPEC.md)

## 1. Problem

Every AI feature on the hosted course spends one key: the site owner's
`ANTHROPIC_API_KEY`. That covers the Tutor, the classifier demo, the support
form, the live preview, the injection playground and Ask Northwind. Anyone who
finds the URL is spending that money. The URL is in a public repo, in slides,
and in rooms full of people.

Today's controls are in `storefront/lib/ratelimit.ts`:

- a per-IP request window for each surface;
- a global cap of **600 requests per day**.

Both count requests, and a request is the wrong unit:

- One Opus assistant run can cost more than a hundred Sonnet live previews.
- A 600-request cap either blocks legitimate learners on a busy day, or allows
  a bill nobody chose.
- No limit is per person. One enthusiastic learner and a script look the same.
- Tutor, live preview and injection spend is not recorded anywhere, so the
  owner cannot see where the money goes.

A learner costs about **$4 over the two-day course**
([facilitator/keys.md](../facilitator/keys.md)). That number is fine to spend
on someone deciding whether the course is worth their time. It is not fine to
spend it without limit on everyone.

## 2. Goals

| # | Goal |
|---|---|
| G1 | Bound the house-key bill in **dollars**, both per learner and per day. |
| G2 | Keep the path to a first AI interaction to **one click**: sign in with GitHub, then try. |
| G3 | Make running out of credit **predictable**. A learner sees it coming, and nobody is cut off mid-answer. |
| G4 | Make bringing your own key **feel safe and be safe**. |
| G5 | Record house spend per surface, so the owner can see what the trial costs. |

## 3. Non-goals

- Payments, top-ups, or selling credit.
- Organisation, team or cohort accounts. A facilitator raising a cohort's grant
  is handled by an admin script, not a UI.
- Metering the local `src/` service. Learners run it on their own laptop with
  their own key already.
- Changes to the labs or curriculum content, apart from a note that the hosted
  demos need sign-in.
- Supporting providers other than Anthropic, or Bedrock/Vertex credentials.

## 4. Personas

- **Self-paced learner.** Arrives from a link, wants to try the Tutor before
  committing. Has a GitHub account, and may not have an Anthropic account yet.
- **Workshop attendee.** One of 30 people behind a single conference NAT IP.
  Per-IP limits hurt them most. They may have been given a key by the
  facilitator.
- **Facilitator.** Runs a room. Needs to know the hosted demos will not stop
  working at 2pm, and needs a way to give a cohort more credit.
- **Site owner.** Pays the bill. Wants a hard daily ceiling and a view of what
  the trial costs.

## 5. User journeys

### J1 — First visit
1. An anonymous visitor reads a lab and opens the Tutor.
2. Reading and non-AI features work as today. A pill in the corner of every
   page reads **Try the AI free · Sign in**. Trying an AI action anyway opens it
   with the server's explanation, rather than every button changing its label.
3. They click it. GitHub asks them to authorise the app, and they return to
   the page they were on.
4. The meter in the navbar reads **$2.00 credit left**. The action they came
   for is one click away.

### J2 — Using the trial
1. Every AI response updates the meter. Nothing is polled; the new balance
   comes back with the response.
2. The meter popover shows what is left in human units: "About 6 more Tutor
   sessions or 40 classifications".
3. At 50%, 80% and 95% used, a small non-blocking notice says what is left
   and links to "Use your own key".

### J3 — Running out
1. When the remaining credit cannot cover the worst case of the next call, the
   call is **refused before it starts**. Nobody loses a half-streamed answer.
2. A gate explains, in this order:
   - you've used your free credit;
   - get a key at console.anthropic.com (with a link);
   - paste it here;
   - it is encrypted, only used for your requests, and forgotten after 24
     hours of inactivity;
   - you can remove it at any time.
3. Cheaper surfaces may still work when an expensive one is refused. The
   gate says which.

### J4 — Bringing a key
1. The learner pastes a key and we verify it with a call that costs nothing.
   A bad key is rejected at once, with the reason.
2. The meter turns blue: **Your key · $0.00 this session**, with the last four
   characters shown.
3. No credit limit applies. Per-IP abuse limits still do, and they are higher.
4. If the key later stops working (revoked, or out of credit), the learner is
   told exactly that. **We never quietly fall back to the house key.**

### J5 — Leaving
- **Remove key** deletes the stored key immediately.
- **Sign out** deletes the session and the key.
- A key untouched for 24 hours deletes itself.

## 6. Requirements

### Functional

| ID | Requirement | Journey |
|---|---|---|
| F1 | Every route that calls Claude is gated by one server-side check. A client-side gate is only presentation. | all |
| F2 | Anonymous requests to AI routes are refused with `sign_in_required`. Non-AI routes are unaffected. | J1 |
| F3 | Sign-in is GitHub OAuth, requests no scopes, and stores no email. | J1 |
| F4 | A new user gets a one-time grant of `TRIAL_GRANT_USD` (default **$2**). | J1 |
| F5 | GitHub accounts younger than `TRIAL_MIN_ACCOUNT_AGE_DAYS` (default 30) get a $0 grant and go straight to J4. New grants per day are capped. | J1 |
| F6 | Trial spend is debited atomically. Two concurrent calls cannot both spend the last dollar. | J2 |
| F7 | A call is refused when remaining credit is below that surface's worst-case cost. | J3 |
| F8 | Every AI response carries the updated meter: a JSON field, or an SSE event. | J2 |
| F9 | A persistent meter is visible on the course site and the storefront, with warnings at 50/80/95%. | J2 |
| F10 | A learner can add a key (verified before storage), see its last four characters, and remove it. | J4, J5 |
| F11 | BYOK calls use only the learner's key. Key failures are reported as `key_invalid` or `key_quota`, with no fallback. | J4 |
| F12 | A house-wide daily dollar budget refuses trial calls once reached. BYOK calls are exempt. | — |

### Non-functional

| ID | Requirement |
|---|---|
| N1 | A key is never written to logs, never returned in any response, never placed in a URL, and never readable by page JavaScript. |
| N2 | Stored keys are encrypted with AES-256-GCM, bound to the session, and expire after 24h idle through a TTL index. |
| N3 | Every new collection that holds anything derived from a person has a TTL index in the same commit ([CLAUDE.md](../../CLAUDE.md), pattern 2). |
| N4 | Counters and ledgers are single atomic document updates, never read-then-write (pattern 1). |
| N5 | In production, a missing database or missing config **fails closed**. In local development with neither, everything behaves as it does today. |
| N6 | Gating adds at most one extra Mongo round trip before a call and one after it. |
| N7 | Rollout is controlled by `BYOK_MODE=off|shadow|enforce` with no redeploy of the website. |

## 7. How far $2 goes

The worst-case figures below are what `estimateMicros` in
`storefront/lib/cost.ts` reserves. They come from each surface's `max_tokens`
and input limits: visitor text is counted at one token per character, and all
input is priced at the cache-write rate. Actual charges are refunded down to the
real cost, which is usually a small fraction of the reservation because of
prompt caching. The "typical" column is a guess until P0's per-surface counters
in `usage_daily` replace it with measured numbers.

| Surface | Model | Worst-case reservation | Typical actual |
|---|---|---|---|
| Live preview | Sonnet 5 | $0.028 | < $0.01 |
| Tutor plan | Sonnet 5 | $0.072 | ~$0.03 |
| Classify / support form / injection | Opus 5 | $0.085 | ~$0.02–0.03 |
| Tutor hint | Sonnet 5 | $0.203 | ~$0.02 |
| Tutor review | Sonnet 5 | $0.216 | ~$0.04 |
| Tutor lesson (per draft; a retry reserves its own) | Sonnet 5 | $0.307 | ~$0.05–0.10 |
| Ask Northwind turn (≤ 6 tool iterations) | Opus 5 | $0.814 | ~$0.05–0.15 |

In practice $2 is a few Tutor sessions plus a good look at the demos. That is
enough to decide, and far short of the full ~$4 course.

**The assistant's reservation is large relative to the grant.** Under the soft
stop in F7, the assistant is refused once less than $0.81 remains, even though
most turns cost about a tenth of that. v1 keeps the whole-run reservation: it is
the only version that can never overspend, and a learner in that position can
still use the Tutor and the demos. Reserving per request inside the tool loop
would free that last $0.81, but it means stopping an agent between turns when
credit runs out, which is the mid-answer cutoff G3 rules out. Revisit with
shadow-mode data.

## 8. Success metrics

- **House spend per day** is at or under `HOUSE_DAILY_BUDGET_USD`, every day.
  This is the metric that matters.
- **Trial → BYOK conversion:** the share of users who exhaust the trial and
  then add a key.
- **Time to first AI call** for a new visitor: median under 30 seconds,
  including GitHub sign-in.
- **Mid-stream cutoffs caused by metering:** zero.
- **Key leak incidents:** zero. `sk-ant-` never appears in logs, and this is
  checked on every release.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Throwaway GitHub accounts farming $2 each | Minimum account age; daily cap on new grants; house daily dollar budget; an organization-level spend limit in the Anthropic Console as the final backstop (Anthropic has no per-workspace cap). |
| Worst-case estimate too low, so the real cost exceeds credit | The estimate is a pure function tested against each surface's constants. A small overrun on one call is bounded by `max_tokens`. |
| `BYOK_ENCRYPTION_KEY` leaks | Keys are only useful together with the database, and live at most 24h idle. Rotation is "bump the version, everyone re-enters". Encourage learners to use a limited-spend key. |
| XSS on the course site steals keys | The key is write-only from the browser. It is never returned, so there is nothing to steal from the page. |
| Learner's key fails mid-session | Clear `key_invalid` / `key_quota` messaging. No silent fallback. |
| Workshop rooms share one IP | BYOK and trial identity are per user, not per IP. Per-IP windows stay as a floor against scripts and are raised for signed-in users. |
| GitHub outage blocks sign-in | Existing sessions keep working for 7 days. BYOK learners are unaffected once signed in. |
| A process crash between debit and refund | The learner is over-charged by at most one worst-case estimate. This errs toward protecting the bill. |

## 10. Rollout

1. **`off`**: the code ships with no behaviour change. Cost math is
   consolidated and every surface is metered in aggregate.
2. **`shadow`**: sign-in and the meter are live, and spend is debited, but
   nothing is refused. Watch real per-surface costs for a week and tune the
   estimates and `TRIAL_GRANT_USD`.
3. **`enforce`**: gating is on. Before flipping, set an organization-level spend
   limit in the Anthropic Console. There is no per-workspace cap, so this is the
   only platform-side ceiling.
4. **Communicate:** a note on the course home page and in
   [facilitator/keys.md](../facilitator/keys.md) for workshop runners.

## 11. Open questions

1. **Does the trial come back after the 180-day user TTL?** Default: yes. A
   returning learner after six months is a feature, not abuse. Keeping a
   hashed-ID tombstone forever is the alternative.
2. **Do BYOK learners keep per-IP limits?** Default: yes, at roughly 3× the
   trial limit. They protect our compute and database, not just the key.
3. **Cohort grants for workshops.** Is an admin script that raises
   `grantMicros` for a list of GitHub logins enough, or do facilitators need a
   join code? Default: the script, until someone asks twice.
4. **Should the Tutor save its plan server-side for signed-in users?** It is
   out of scope here. Sign-in makes it possible, and Decision 8's reasoning says
   not to do it without a reason.
