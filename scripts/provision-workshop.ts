/**
 * Workshop environment management. `npm run workshop -- <command>`
 *
 * READ THIS BEFORE RUNNING ANYTHING.
 *
 * The obvious design for this script — "create a workspace and an API key per
 * learner with a spend cap, print a CSV" — is not achievable, and finding that
 * out is most of the value here. Verified against the Admin API docs on
 * 2026-08-20:
 *
 *   WORKSPACES      can be created.  POST /v1/organizations/workspaces
 *   API KEYS        CANNOT be created via the API. The Admin API can LIST them
 *                   (GET /v1/organizations/api_keys) and UPDATE status/name
 *                   (POST /v1/organizations/api_keys/{id}), but issuing a key
 *                   is a Console action. There is no create endpoint.
 *   SPEND LIMITS    are per-USER and Claude Enterprise only. POST
 *                   /v1/organizations/spend_limits accepts only
 *                   scope.type "user"; there is no per-workspace cap, and the
 *                   endpoint is unavailable to Claude Console organizations.
 *
 * So the honest shape is a THREE-PART workflow, and only two parts automate:
 *
 *   1. plan      (automated) work out what is needed, change nothing
 *   2. apply     (automated) create the workspaces
 *      ...then a human issues keys in the Console. Unavoidable.
 *   3. teardown  (automated) archive workspaces and DISABLE every key issued
 *                for the workshop
 *
 * Step 3 is the one that matters most and the one a manual process always
 * skips. Nobody forgets to hand out keys at 9am; everybody forgets to revoke
 * thirty of them at 5pm, and a live key on a laptop at a conference is the
 * actual risk this tooling exists to reduce.
 *
 * SAFETY RAILS, because this talks to an org-wide admin surface:
 *   - Dry run by default. `--apply` is required for anything that writes.
 *   - Refuses to run without ANTHROPIC_ADMIN_KEY (a distinct credential from
 *     ANTHROPIC_API_KEY — it starts sk-ant-admin and is issued separately).
 *   - Teardown will not touch a workspace whose name lacks the run prefix, so
 *     a mistyped label cannot archive your production workspace.
 *   - Never writes output inside the repo. Key material must not end up in a
 *     git working tree even by accident.
 *
 * Usage:
 *   npm run workshop -- plan --roster roster.csv --label 2026-09-mongo
 *   npm run workshop -- apply --roster roster.csv --label 2026-09-mongo --apply
 *   npm run workshop -- status --label 2026-09-mongo
 *   npm run workshop -- teardown --label 2026-09-mongo --apply
 */
import "../src/lib/env.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";

const ADMIN_BASE = "https://api.anthropic.com/v1/organizations";
const REPO_ROOT = resolve(import.meta.dirname, "..");

interface Learner {
  email: string;
  name: string;
}

interface Workspace {
  id: string;
  name: string;
  archived_at: string | null;
  type: "workspace";
}

interface ApiKey {
  id: string;
  name: string;
  workspace_id: string | null;
  status: string;
  created_at: string;
}

// --- argument handling -------------------------------------------------------

const argv = process.argv.slice(2);
const command = argv[0] ?? "";
const APPLY = argv.includes("--apply");

function flag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

function required(name: string): string {
  const v = flag(name);
  if (!v) {
    console.error(`Missing --${name}.`);
    process.exit(1);
  }
  return v;
}

/**
 * Every workspace this script creates is named `<prefix><label>-<n>`, and
 * teardown will only touch names that match. A label is therefore both a
 * grouping and a blast-radius limit.
 */
const NAME_PREFIX = "workshop-";
const workspaceName = (label: string, n: number) =>
  `${NAME_PREFIX}${label}-${String(n).padStart(2, "0")}`;

// --- admin API ---------------------------------------------------------------

function adminKey(): string {
  const key = process.env.ANTHROPIC_ADMIN_KEY;
  if (!key) {
    console.error(
      "ANTHROPIC_ADMIN_KEY is not set.\n\n" +
        "This is a DIFFERENT credential from ANTHROPIC_API_KEY: it starts with\n" +
        "sk-ant-admin, only an organization admin can issue it, and it can\n" +
        "modify org-wide resources. Do not reuse your workshop key here, and do\n" +
        "not put it in the repo's .env — export it for the session instead.",
    );
    process.exit(1);
  }
  return key;
}

async function admin<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${ADMIN_BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "x-api-key": adminKey(),
      "anthropic-version": "2023-06-01",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}\n${detail.slice(0, 600)}`);
  }
  return (await res.json()) as T;
}

/** Pages through an Admin API list endpoint. */
async function listAll<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (;;) {
    const sep = path.includes("?") ? "&" : "?";
    const page = await admin<{ data: T[]; has_more?: boolean; last_id?: string }>(
      `${path}${sep}limit=100${after ? `&after_id=${after}` : ""}`,
    );
    out.push(...page.data);
    if (!page.has_more || !page.last_id) break;
    after = page.last_id;
  }
  return out;
}

// --- roster ------------------------------------------------------------------

/**
 * A two-column CSV: email,name. Deliberately not a spreadsheet parser — a
 * roster is thirty lines and every dependency here is a dependency in a script
 * that holds an admin credential.
 */
function readRoster(path: string): Learner[] {
  const abs = resolve(process.cwd(), path);
  if (!existsSync(abs)) {
    console.error(`No roster at ${abs}`);
    process.exit(1);
  }
  return readFileSync(abs, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .filter((l) => !/^email\s*,/i.test(l))
    .map((line) => {
      const [email = "", name = ""] = line.split(",").map((c) => c.trim());
      return { email, name: name || email };
    })
    .filter((l) => l.email.includes("@"));
}

/**
 * Refuses to write anywhere inside the repo.
 *
 * The output of this workflow is a mapping from people to credentials. A
 * `git add -A` on a tired Friday is all it takes for that to become public,
 * and the fix is for the file to be impossible to place there in the first
 * place.
 */
function assertOutsideRepo(path: string): void {
  const abs = resolve(process.cwd(), path);
  const rel = relative(REPO_ROOT, abs);
  if (!rel.startsWith("..")) {
    console.error(
      `Refusing to write ${abs}\n\n` +
        "That path is inside the repository. This file maps people to credentials;\n" +
        "put it somewhere a git command cannot reach, e.g. ~/workshop-2026-09/.",
    );
    process.exit(1);
  }
}

// --- measured costs ----------------------------------------------------------

/**
 * What a learner actually spends, measured from this repo's own runs rather
 * than estimated. See docs/facilitator/keys.md for the derivation.
 */
const COST_PER_LEARNER = {
  day1: 1.5,
  day2: 4.0,
};

// --- commands ----------------------------------------------------------------

async function plan(): Promise<void> {
  const label = required("label");
  const learners = readRoster(required("roster"));
  const existing = await listAll<Workspace>("/workspaces");
  const mine = existing.filter(
    (w) => w.name.startsWith(`${NAME_PREFIX}${label}-`) && w.archived_at === null,
  );

  console.log(`\nWorkshop plan — label "${label}"\n`);
  console.log(`  learners on roster:      ${learners.length}`);
  console.log(`  workspaces already live: ${mine.length}`);
  console.log(`  workspaces to create:    ${Math.max(0, learners.length - mine.length)}\n`);

  const days = flag("days") === "1" ? 1 : 2;
  const per = days === 1 ? COST_PER_LEARNER.day1 : COST_PER_LEARNER.day1 + COST_PER_LEARNER.day2;
  console.log(`  measured spend per learner (${days}-day):  $${per.toFixed(2)}`);
  console.log(`  roster total:                          $${(per * learners.length).toFixed(2)}`);
  console.log(
    `  suggested per-learner cap (3x):        $${(per * 3).toFixed(2)}\n` +
      `    3x rather than 1.1x: a learner who re-runs eval:models while debugging\n` +
      `    is doing the lab correctly, and a cap that stops them mid-exercise costs\n` +
      `    more in room time than the overage costs in dollars.\n`,
  );

  console.log("  MANUAL STEP — keys cannot be created through the Admin API.");
  console.log("  After `apply`, issue one key per workspace in the Console and");
  console.log("  name it exactly the workspace name, so `teardown` can find it.\n");
}

async function apply(): Promise<void> {
  const label = required("label");
  const learners = readRoster(required("roster"));
  const existing = await listAll<Workspace>("/workspaces");
  const live = new Set(
    existing.filter((w) => w.archived_at === null).map((w) => w.name),
  );

  console.log(`\n${APPLY ? "Creating" : "DRY RUN — would create"} workspaces for "${label}"\n`);

  for (let i = 0; i < learners.length; i++) {
    const name = workspaceName(label, i + 1);
    if (live.has(name)) {
      console.log(`  exists   ${name}`);
      continue;
    }
    if (!APPLY) {
      console.log(`  would create  ${name}   (${learners[i]!.email})`);
      continue;
    }
    const ws = await admin<Workspace>("/workspaces", {
      method: "POST",
      body: { name, tags: { workshop: label } },
    });
    console.log(`  created  ${ws.name}  ${ws.id}   (${learners[i]!.email})`);
  }

  if (!APPLY) {
    console.log("\n  Nothing was created. Re-run with --apply to make changes.\n");
    return;
  }

  console.log(
    "\n  NEXT, BY HAND: issue one API key per workspace in the Console at\n" +
      "  https://platform.claude.com/settings/keys and name each key exactly\n" +
      "  after its workspace. `teardown` matches on that name.\n",
  );
}

async function status(): Promise<void> {
  const label = required("label");
  const workspaces = (await listAll<Workspace>("/workspaces")).filter(
    (w) => w.name.startsWith(`${NAME_PREFIX}${label}-`),
  );
  const keys = (await listAll<ApiKey>("/api_keys")).filter((k) =>
    k.name.startsWith(`${NAME_PREFIX}${label}-`),
  );

  const liveWs = workspaces.filter((w) => w.archived_at === null);
  const activeKeys = keys.filter((k) => k.status === "active");

  console.log(`\nWorkshop status — "${label}"\n`);
  console.log(`  workspaces:  ${liveWs.length} live, ${workspaces.length - liveWs.length} archived`);
  console.log(`  api keys:    ${activeKeys.length} active, ${keys.length - activeKeys.length} inactive\n`);

  // The number that matters after a workshop ends.
  if (activeKeys.length > 0) {
    console.log(`  ${activeKeys.length} key(s) still ACTIVE:`);
    for (const k of activeKeys) console.log(`    ${k.name}  ${k.id}  created ${k.created_at}`);
    console.log(`\n  Run \`teardown --label ${label} --apply\` when the workshop is over.\n`);
  } else {
    console.log("  No active workshop keys. Nothing outstanding.\n");
  }
}

async function teardown(): Promise<void> {
  const label = required("label");
  const prefix = `${NAME_PREFIX}${label}-`;

  const keys = (await listAll<ApiKey>("/api_keys")).filter(
    (k) => k.name.startsWith(prefix) && k.status === "active",
  );
  const workspaces = (await listAll<Workspace>("/workspaces")).filter(
    (w) => w.name.startsWith(prefix) && w.archived_at === null,
  );

  console.log(`\n${APPLY ? "Tearing down" : "DRY RUN — would tear down"} "${label}"\n`);
  console.log(`  keys to disable:      ${keys.length}`);
  console.log(`  workspaces to archive: ${workspaces.length}\n`);

  // Keys FIRST. If the run dies halfway, the half that completed should be the
  // half that removes access — an archived workspace with a live key is worse
  // than a live workspace with no key.
  for (const k of keys) {
    if (!APPLY) {
      console.log(`  would disable  ${k.name}  ${k.id}`);
      continue;
    }
    await admin(`/api_keys/${k.id}`, { method: "POST", body: { status: "inactive" } });
    console.log(`  disabled  ${k.name}`);
  }

  for (const w of workspaces) {
    if (!APPLY) {
      console.log(`  would archive  ${w.name}  ${w.id}`);
      continue;
    }
    await admin(`/workspaces/${w.id}/archive`, { method: "POST" });
    console.log(`  archived  ${w.name}`);
  }

  if (!APPLY) {
    console.log("\n  Nothing was changed. Re-run with --apply.\n");
  } else {
    console.log("\n  Done. Re-run `status` to confirm nothing is outstanding.\n");
  }
}

// --- entry -------------------------------------------------------------------

const COMMANDS: Record<string, () => Promise<void>> = {
  plan,
  apply,
  status,
  teardown,
};

async function main(): Promise<void> {
  const run = COMMANDS[command];
  if (!run) {
    console.error(
      `Usage: npm run workshop -- <plan|apply|status|teardown> [flags]\n\n` +
        `  plan      --roster f.csv --label L [--days 1|2]   read-only\n` +
        `  apply     --roster f.csv --label L [--apply]      creates workspaces\n` +
        `  status    --label L                               read-only\n` +
        `  teardown  --label L [--apply]                     disables keys, archives\n\n` +
        `Everything is a dry run unless --apply is passed.\n` +
        `Requires ANTHROPIC_ADMIN_KEY (not ANTHROPIC_API_KEY).\n\n` +
        `API keys cannot be created programmatically — see docs/facilitator/keys.md.\n`,
    );
    process.exit(1);
  }

  const out = flag("out");
  if (out) assertOutsideRepo(out);

  await run();
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
