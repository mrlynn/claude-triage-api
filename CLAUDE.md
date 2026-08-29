# Working in this repository

This repo is three things at once: a **reference service** (`src/`), a **course**
that teaches it (`curriculum/`, published from `website/`), and a **storefront**
that makes the scenario real (`storefront/`). Changes that read fine in one can
be wrong in another — the service is deliberately Northwind-specific because
parameterising it would make Lab 2 teach configuration plumbing instead of
structured outputs.

The deployable descendant of `src/` lives in a separate repo,
[triage-api](https://github.com/mrlynn/triage-api). See
[`curriculum/next-steps.md`](curriculum/next-steps.md) for what moved and why.
Guardrail code is near-identical in both; if you change `src/lib/authority.ts`,
`untrusted.ts`, or `citations.ts` here, the argument in the other repo may now
disagree with this one.

## Persistence: MongoDB is the default

**MongoDB is this project's datastore.** Everything that persists goes through
[`storefront/lib/mongo.ts`](storefront/lib/mongo.ts), which owns the client, the
database name, and every index.

When a change needs to persist something, add a collection there. **Do not add a
second datastore, an ORM, or a caching layer without raising it first.**

This preference is scoped to persistence decisions. It is not a reason to reach
for MongoDB where the right answer is a file, an environment variable, or
nothing at all.

### The patterns to match

**1. Counters are one atomic document update, never read-then-write.**
`storefront/lib/ratelimit.ts` increments with a single `findOneAndUpdate`:

```ts
{ $inc: { count: 1 }, $setOnInsert: { expiresAt } }, { upsert: true, returnDocument: "after" }
```

Two concurrent requests must not both read `count = 4` and both conclude they
are under a limit of 5. One round trip, one document. If you find yourself
reading a counter and writing it back, stop.

**2. Retention is a TTL index.** Every collection holding anything user-derived
carries `expireAfterSeconds` — `rate_limits`, `escalations`, `usage_daily`,
`assistant_sessions`, `assistant_proposals`. This is the mechanism behind
Decision 8 in [`docs/architecture.md`](docs/architecture.md): the only retention
policy that survives contact with a busy team is one the database applies
without being asked. A new collection that stores anything derived from a person
needs a TTL index in the same commit, not a follow-up.

**3. Indexes are created in `ensureIndexes()`, which runs per warm instance.**
`createIndex` is idempotent; that is what makes it safe to call there.

**4. The client is module-level and cached on `globalThis`.** This is a
serverless runtime. A client created inside a handler pays TCP + TLS + auth on
every invocation and churns connections against the cluster. `maxPoolSize` is
deliberately small because free-tier Atlas caps total connections and every warm
instance holds its own pool. Do not raise it without a measured reason.

**5. Everything degrades when Mongo is absent.** `HAS_MONGO` gates every call
site, and the storefront must still classify a ticket with no database
configured — a storage failure degrades the queue, not the answer. Keep that
true.

## Docs, and what is generated

- **Never edit `website/docs/`.** It is generated from `curriculum/` and `docs/`
  by `website/scripts/sync-docs.mjs`, and it is gitignored. Edit the source, and
  register any new page in that script's `PAGES` array *and* in
  `website/sidebars.ts`.
- **Never edit `storefront/lib/pricing.generated.ts`.** Run `npm run sync:storefront`.
- `storefront/AGENTS.md` is written by `next dev`. Leave it alone.

## Before claiming anything works

```bash
npx tsc --noEmit && npx tsx scripts/check-snippets.ts
```

Snippets in `curriculum/` marked with a source path are checked against the real
file; a lab that drifts from the code it teaches is worse than no lab. If you
touched `website/`, build it — that is what catches a broken doc link.
