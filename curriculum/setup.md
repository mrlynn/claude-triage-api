# Setup

Fifteen minutes, most of it waiting on `npm install`. Do this before Lab 1, and
if you are attending a workshop, do it the day before rather than in the room.

---

## How the labs expect you to work

**A terminal and an editor. That is the whole toolchain.**

Nothing here depends on VS Code, a debugger config, or an extension. The labs
name files to open — `src/schemas.ts`, `src/prompts.ts`, `src/tools/index.ts` —
and do not care what you open them with.

**You will want two terminal panes.** One runs the service, one runs `curl`.
Labs 2, 3, and 5 have you edit a file and immediately re-hit an endpoint, so you
will bounce between them constantly. A learner who tries to do both in one pane
gets stuck within five minutes.

```
┌─────────────────────────┬─────────────────────────┐
│  pane 1                 │  pane 2                 │
│  npm run dev            │  curl ...               │
│  (leave it running)     │  npm run eval           │
│                         │  npx tsx scratch/...    │
└─────────────────────────┴─────────────────────────┘
```

Lab 1 is the exception. It runs standalone scripts with `npx tsx` and needs no
server at all.

---

## Prerequisites

| | Check | If missing |
|---|---|---|
| Node 20+ | `node -v` | [nodejs.org](https://nodejs.org) or `nvm install 20` |
| `curl` | `curl --version` | preinstalled on macOS and Linux |
| `jq` | `jq --version` | `brew install jq` / `apt install jq` / `winget install jqlang.jq` |
| `git` | `git --version` | [git-scm.com](https://git-scm.com) |

`jq` is not optional. Every lab pipes JSON through it, and the responses are
deeply nested enough that reading them raw is genuinely unpleasant.

**Windows:** use WSL2. The labs assume a POSIX shell, and several use
single-quoted JSON in `curl` bodies that PowerShell quotes differently.

---

## An API key with billing enabled

Get one at
[console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).

**Billing has to be enabled on the organization.** A valid key on an org with no
credit fails at the first call with an error that reads like an authentication
problem, which sends people looking in exactly the wrong place. If your key
looks right and the first call still fails, check billing before you check
anything else.

---

## Install

```bash
git clone <your-fork-url> && cd claude-triage-api
```

```bash
npm install
```

```bash
cp .env.example .env
```

Open `.env` and set your key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

`.env` and `.env.local` are both loaded automatically at startup by
[`src/lib/env.ts`](../src/lib/env.ts). There is no dotenv dependency, you do not
need to `export` anything, and a real shell variable always wins over the file
if you want to override for one command.

Both files are gitignored. Do not commit a key.

---

## Verify

```bash
npm run smoke
```

This exercises all four routes in-process and takes about 40 seconds. You should
see a token estimate, a triage classification, a **cache hit on the second
call**, a tool trace, and a streamed reply.

That cache line is the one to look for:

```
CACHE HIT — 4711 tokens read from cache, saving $0.02120 on this call alone.
```

If you get `CACHE MISS` on a fresh clone, something is wrong with your setup
rather than with your understanding. Check the troubleshooting table below.

Then start the service:

```bash
npm run dev
```

```bash
curl -s localhost:8787/healthz | jq
```

---

## If port 8787 is taken

Common, since 8787 is a popular default. Every lab writes `localhost:8787`, so
pick a port once and substitute throughout:

```bash
PORT=8788 npm run dev
```

Find what is holding it:

```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN
```

---

## What you edit, and what you run

| You edit | To change |
|---|---|
| `src/schemas.ts` | the model's output contract (Lab 2) |
| `src/tools/index.ts` | tool definitions and descriptions (Lab 3) |
| `src/prompts.ts` | system prompts and cache breakpoints (Lab 5) |
| `src/config.ts` | model, effort per route, pricing (Lab 5) |
| `evals/dataset.jsonl` | the gold set (Lab 6) |
| `scratch/` | your own throwaway scripts (Lab 1) |

`npm run dev` watches and restarts, so an edit is live by the time you switch
panes.

`scratch/` is yours and gitignored. Put experiments there.

---

## What it costs

Real measured numbers, not estimates.

| Command | Cost |
|---|---|
| `npm run smoke` | ~$0.10 |
| `npm run eval` | ~$0.20 |
| A single `curl` to `/v1/triage` | ~$0.006 |
| `/v1/estimate` | free, it runs no inference |

Budget **$2–4** for the full lab sequence, assuming you re-run things while
experimenting. Labs 5 and 6 dominate, because evals make 16 calls each.

If you want to watch spend without spending, `/v1/estimate` counts tokens
server-side and projects monthly cost without calling the model.

---

## Troubleshooting

Every one of these has actually happened.

**`Error: Transform failed ... Expected "in" but found "."`**

You used `#` as a comment. That is Python and shell, not TypeScript. In TS, `#`
starts a private class field, so `#console.log(x)` parses as a private
identifier and the error points at the `.`, which is why it reads so strangely.
Use `//`.

**`No Anthropic credentials found`**

`.env` is missing, or the key line is misspelled. The variable is
`ANTHROPIC_API_KEY` exactly.

**HTTP 500 `upstream_auth_failed`**

The key was rejected. Either it is wrong, or billing is not enabled on the org.
Check billing second, not last.

**`EADDRINUSE: address already in use :::8787`**

Something else owns the port. Use `PORT=8788 npm run dev`.

**Streaming arrives all at once**

You forgot `curl -N`. Without it curl buffers the whole response and streaming
looks broken. This is a preview of the real production bug in Lab 4 Step 4,
where a proxy does the same thing.

**`jq: command not found`**

See the prerequisites table.

**`cache_hit: false` on the second identical call**

If this happens on an unmodified clone, your prefix is not stable. If it happens
after you edited `src/prompts.ts`, congratulations, you have found the point of
Lab 5 early. The usual cause is something varying in the system prompt, most
often a timestamp.

**Everything is slow**

Normal. Individual calls run 3–10 seconds because adaptive thinking is on and
`/v1/resolve` makes several round trips. `npm run eval` takes 8–10 minutes. It
is not hung.

---

## Ready

You should be able to run all four of these:

- [ ] `npm run smoke` completes and reports a cache hit
- [ ] `npm run dev` starts and `/healthz` returns `{"ok":true}`
- [ ] `curl -s localhost:8787/v1/triage -H 'content-type: application/json' -d '{"message":"test"}' | jq` returns a classification
- [ ] `npx tsx scratch/hello.ts` runs, once Lab 1 has you create it

Then start with [the scenario](scenario.md), or go straight to
[Lab 1](labs/lab-1-first-call.md).
