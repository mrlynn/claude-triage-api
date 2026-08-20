# Running the workshop: keys, workspaces, and what it costs

Everything on this page is for the person delivering the course, not for
learners. For teaching material see
[`01-instructor-guide.md`](../../curriculum/01-instructor-guide.md).

---

## The uncomfortable part first

**API keys cannot be created programmatically.** The Admin API can list keys
and change their status and name, but issuing a key is a Console action. There
is no create endpoint.

That constraint shapes the whole workflow. Verified against the Admin API docs
on 2026-08-20:

| Thing | Automatable? | Endpoint |
|---|---|---|
| Create a workspace | **yes** | `POST /v1/organizations/workspaces` |
| List keys | yes | `GET /v1/organizations/api_keys` |
| Disable a key | **yes** | `POST /v1/organizations/api_keys/{id}` |
| Archive a workspace | yes | `POST /v1/organizations/workspaces/{id}/archive` |
| **Create a key** | **no** | — Console only |
| Per-workspace spend cap | **no** | spend limits are per-*user* |

The spend-limit one catches people out. `POST /v1/organizations/spend_limits`
accepts only `scope.type: "user"`, and the API is **Claude Enterprise only** —
it is explicitly unavailable to Claude Console organizations. If you were
planning to cap each learner's workspace, you cannot. See
[Budget control](#budget-control-when-you-cannot-cap-a-workspace) for what to
do instead.

---

## The workflow

```bash
npm run workshop -- plan --roster ~/workshop/roster.csv --label 2026-09-mongo
```

Everything is a **dry run** unless you pass `--apply`. `plan` never writes
anything at all.

You need `ANTHROPIC_ADMIN_KEY` exported for the session. It is a different
credential from `ANTHROPIC_API_KEY` — it starts `sk-ant-admin`, only an
organization admin can issue it, and it can modify org-wide resources. Do not
put it in the repo's `.env`.

The roster is a two-column CSV:

```
email,name
dana@example.com,Dana Kowalski
priya@example.com,Priya Raman
```

### 1. Create the workspaces

```bash
npm run workshop -- apply --roster ~/workshop/roster.csv --label 2026-09-mongo --apply
```

One workspace per learner, named `workshop-<label>-01`, `-02`, and so on. The
name prefix is load-bearing: `teardown` will only touch names that match it, so
a mistyped label cannot archive your production workspace.

### 2. Issue the keys by hand

In the Console, create one key per workspace and **name each key exactly after
its workspace**. `status` and `teardown` match on that name; a key called
"temp" is a key the teardown will not find.

Budget about 20 seconds per learner. For a room of 30 that is ten minutes, and
it is the only part of this that does not scale — worth knowing before you
agree to run it for 200 people.

### 3. Check before you start

```bash
npm run workshop -- status --label 2026-09-mongo
```

Confirms every workspace is live and every key is active. Run it the evening
before rather than at 8:55am.

### 4. Tear down when you finish

```bash
npm run workshop -- teardown --label 2026-09-mongo --apply
```

Disables every key, then archives every workspace. **Keys first, deliberately:**
if the run dies halfway, the half that completed should be the half that
removes access. An archived workspace with a live key is worse than a live
workspace with no key.

This is the step that matters. Nobody forgets to hand out keys at 9am;
everybody forgets to revoke thirty of them at 5pm, and a live key on a laptop
at a conference is the actual risk this tooling exists to reduce. Run `status`
afterwards and confirm it reports nothing outstanding.

---

## What it costs

Measured from actual runs of this repo against `claude-opus-5` on 2026-08-20,
not estimated. Your numbers will vary with model and with how much learners
experiment.

| Command | Cost | Notes |
|---|---|---|
| `npm run smoke` | ~$0.15 | setup verification, once |
| `npm run eval:quick` | ~$0.09 | Lab 0, then once per lab 1–6 |
| `npm run eval` | ~$0.27 | Lab 6, includes the judge |
| `npm run eval:models` | ~$0.19 | Lab 7 |
| `npm run eval:redteam` | ~$0.40 | Lab 8, the most expensive single command |
| `npm run triage:queue` | ~$0.16 | Lab 9 |
| `npm run triage:queue:batch` | ~$0.20 | Lab 9 |

Rolled up, per learner:

| | Commands | Spend |
|---|---|---|
| **Day 1** (Lab 0 + Labs 1–6) | smoke, ~8 × `eval:quick`, one full `eval` | **~$1.50** |
| **Day 2** (Labs 7–9) | `eval:models`, 2 × `eval:redteam`, three queue modes, re-runs | **~$2.50** |
| **Both days** | | **~$4.00** |

**Set the cap at 3× the table, not 1.1×.** A learner who re-runs `eval:models`
three times while debugging is doing the lab correctly. A cap that stops them
mid-exercise costs more in room time and morale than the overage costs in
dollars, and you will spend the difference explaining it.

### Trimming the bill

If you are running a large room on a shared budget, the two levers are:

1. **Run `eval:redteam` and Lab 9 Step 1 once on the projector.** Between them
   they are about $0.95 of the $4.00, and both are more instructive watched
   together than run alone — the red-team output invites discussion, and Lab 9's
   three-way comparison is a table everyone should read at the same moment.
2. **Point them at the playgrounds.** The
   [model matrix](https://claude-triage-labs.vercel.app/playground/models) and
   [batch planner](https://claude-triage-labs.vercel.app/playground/batch)
   render checked-in results from real runs, so the numbers are the same ones
   they would have produced.

---

## Budget control when you cannot cap a workspace

Since per-workspace spend limits do not exist, use these instead, in order of
how much they actually help:

1. **Organization-level limits in the Console.** Blunt, but it is the only hard
   ceiling available to a Console organization, and a hard ceiling is what you
   want when the failure mode is a bill.
2. **Tear down promptly.** A key that is inactive by 6pm cannot be spent
   against on Saturday. This is most of the risk, and it is fully automated.
3. **Watch during the session.** `npm run workshop -- status` after each break
   takes five seconds and tells you if something is wrong while you can still
   do something about it.
4. **Per-user spend limits, if you are on Claude Enterprise.**
   `POST /v1/organizations/spend_limits` with `scope.type: "user"` gives you a
   real per-person cap. Requires an admin key with the `write:spend_limits`
   scope. Amounts are strings in **minor units** — `"400"` is $4.00, and
   getting that wrong by a factor of 100 is the obvious way to have a bad day.

If you are on Console rather than Enterprise, options 1–3 are what you have.
Plan accordingly rather than discovering it on the morning.

---

## Common problems

**A learner's key does not work.** Check that the key is attached to the right
workspace and that the workspace is not archived. `status --label <label>` will
show you.

**Keys still active after the workshop.** Run `teardown` again — it is
idempotent and only touches active keys. If a key does not appear, its name
does not match the `workshop-<label>-` prefix and you will need to disable it
by hand in the Console. This is why step 2 insists on the naming.

**`teardown` reports nothing to do but the Console shows keys.** You are
looking at keys created outside this workflow, or under a different label. The
prefix match is deliberately strict; widening it is how you archive something
you did not mean to.

**You do not have an admin key.** You cannot use any of this, and that is
correct — the Admin API modifies org-wide resources. Ask your organization
admin, or fall back to creating a handful of shared keys by hand and rotating
them afterwards.
