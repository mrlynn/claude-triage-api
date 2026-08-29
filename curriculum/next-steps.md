# Where this goes next

You have finished the labs. You have a service that classifies a ticket, looks
up an order, recommends an action, re-checks that recommendation in code, and
tells you what it cost. That is the Claude API, learned.

Learned on *one* API. If the question you are left with is whether it was the
right one, [Claude vs Cursor](../docs/comparison.md) builds these same four
routes on Cursor's Agent SDK and compares the two with a command you can
re-run. This page answers the other question: what it takes to run what you
just built.

What you do **not** have is something you can put in front of your own helpdesk
on Monday. The service in `src/` is deliberately Northwind's: the taxonomy is
hardcoded, the handbook is one company's, the order data is a JSON fixture, and
nothing writes back to a ticketing system because there is no ticketing system.
Every one of those is the right call for a course — parameterising them would
have made Lab 2 a lesson in configuration plumbing instead of structured
outputs — and every one of them is wrong for production.

So there is a second repository that carries the same technique with those four
things moved behind a config seam.

## triage-api

**[github.com/mrlynn/triage-api](https://github.com/mrlynn/triage-api)** — an
opinionated, open-source reference implementation of AI ticket triage, with the
guardrails already in it.

It is this course's service after the questions Lab 9 raises and does not
answer. The parts you recognise are mostly unchanged; the parts that are new are
the ones that only show up once something has to run.

| This course | triage-api |
|---|---|
| Northwind's taxonomy, hardcoded in `src/schemas.ts` | **policy packs** — taxonomy, handbook, authority limits and eval set as a matched set you copy and edit |
| `AGENT_REFUND_LIMIT_USD = 200` in `src/lib/authority.ts` | `pack.authority.refundLimitUsd`, validated at boot |
| Order data from a fixture | a `DataProvider` seam: fixtures, HTTP, or your own |
| Nothing arrives, nothing is written back | signed, idempotent webhook ingest and **connectors for Chatwoot, Zammad, Zendesk, GitHub Issues, and a signed generic webhook** |
| Escalations printed to the console | a store, a reviewer queue, and a retention policy that is a TTL index rather than a promise |

The guardrails you built in Labs 3, 6 and 8 are the same code. `authority.ts`
still re-derives the refund limit from the tool trace and still counts
`model_claimed_authority_it_lacked`. `untrusted.ts` still escapes rather than
blocklists. `citations.ts` still verifies clauses by existence rather than by
tool call, and still carries the comment about getting that wrong first.

## What is genuinely new there

Three ideas the course does not teach, because none of them came from teaching —
they came from making the thing deployable and finding out.

**Adapters as a contract, not a folder.** Four interfaces in one file
(`src/adapters/types.ts`) and an executable conformance suite that checks them.
Sources must fail closed when their secret is unset. Sinks must never throw,
because a sink failure is someone else's outage and must not cost you a decision
you already paid a model for. Both of those are asserted, not documented.

**Degrade loudly.** If a deployment has no customer lookup, the rolling refund
ceiling *cannot run*. The service does not quietly approve the refunds it cannot
check — it escalates them with `control_unavailable:rolling_ceiling` and says so
on `/readyz`. A guardrail that stops running when its inputs disappear, while
the summary still reads "0 violations", is worse than no guardrail. This is the
sequel to Lab 8 Step 3, and it is the argument that lab is missing.

**Advisory by default.** `sinks: []` out of the box. It classifies, it stores,
it shows you a queue, and it touches your ticketing system not at all. Nobody
puts an unvetted classifier in the write path of their helpdesk on day one.

## If you are going to use it

Read it in this order:

1. [`docs/what-this-is-not.md`](https://github.com/mrlynn/triage-api/blob/main/docs/what-this-is-not.md)
   first. It is short, and it will save you planning around something the
   repository does not do.
2. [`docs/policy-packs.md`](https://github.com/mrlynn/triage-api/blob/main/docs/policy-packs.md)
   — the seam that replaces everything Northwind-shaped in this course.
3. [`docs/adapters.md`](https://github.com/mrlynn/triage-api/blob/main/docs/adapters.md)
   — the contract, and why each conformance check exists. Note the advice to
   consider *not* writing an adapter: a signed POST from the system you already
   control usually beats a vendor adapter guessing at your custom fields.
4. A worked connector, if you run one of these:
   [Chatwoot](https://github.com/mrlynn/triage-api/blob/main/docs/integrations/chatwoot.md)
   or [Zammad](https://github.com/mrlynn/triage-api/blob/main/docs/integrations/zammad.md).

Files there carry `COURSE REF:` comments pointing back at the lab that explains
them, so you can always get from a line of production code to the argument
behind it.

## What has not changed

Your eval set is still the thing that decides whether any of this works. Ten to
fifteen real tickets, hand-labelled, is the step people skip and the reason
their triage system quietly stops being trustworthy without anyone noticing.
[Lab 6](labs/lab-6-evals.md) is the one to re-read before you ship, not this
page.
