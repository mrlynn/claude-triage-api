/**
 * Generates a Tutor lesson for each lab and runs its starter, to catch starter
 * code that does not do what its exercise prompt says it does.
 *
 * WHY THIS EXISTS: prompt rules kept narrowing this and never closed it. Live
 * lessons shipped symptoms nobody had run: a prompt predicting `cacheHit:
 * false` for a script that printed `true`, and a mock whose case-sensitive
 * check meant the promised crash never happened. Each was caught only by
 * running the generated starter. Whether generated code does what its prompt
 * claims can only be checked by running it, so this runs it. Replaying those
 * two lessons with --replay flags the second; see "cannot do" below for why
 * two other failures (a placeholder handbook, a 30-token budget) are out of
 * reach: both were about the fixed version, which this never runs.
 *
 * Needs a storefront serving /api/tutor/lesson, with BYOK enforcement off
 * (the default in development):
 *
 *   cd storefront && npm run dev          # in one terminal
 *   npm run check:starters                # every lab with authored mistakes
 *   npm run check:starters -- --labs lab-2,lab-5
 *   npm run check:starters -- --allow-api # let starters make their real calls
 *   npm run check:starters -- --no-judge  # run starters, skip the comparison
 *   npm run check:starters -- --replay scratch/.starter-check
 *                                         # rerun saved <lab>.lesson.json files
 *                                         # instead of generating; no storefront
 *
 * Options: --url (default STARTER_CHECK_URL or http://localhost:3000),
 * --level new|some|shipped (default some), --timeout seconds per starter
 * (default 20), --concurrency lessons at once (default 3).
 *
 * WHAT IT RUNS: code a model wrote, on this machine. Each starter runs as its
 * own process under a timeout, from scratch/.starter-check/, with
 * ANTHROPIC_API_KEY removed from its environment unless --allow-api. That
 * bounds the spend and the runtime. It is not a sandbox; read a starter before
 * you pass --allow-api if you have any doubt about it.
 *
 * WHAT IT CANNOT DO: fix the starter and check the fix disappears. The
 * comparison is between the prompt's claims and one run of the unfixed code.
 * It flags; a person decides.
 *
 * Exits non-zero if any lab errored, had a planted mistake dropped, or was
 * judged inconsistent with its prompt. The full report is written next to the
 * starters as JSON.
 */
import "../src/lib/env.js";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "../src/anthropic.js";
import { MODEL_TIERS } from "../src/config.js";
import { mapWithConcurrency } from "../src/lib/pool.js";
import { wrapUntrusted } from "../src/lib/untrusted.js";
import { summarizeUsage } from "../src/lib/usage.js";
import { z } from "zod";
import {
  STARTER_JUDGE_MAX_TOKENS,
  STARTER_VERDICT_FIELDS,
  capOutput,
  starterVerdictPrompt,
  type StarterRun,
  type StarterVerdict,
} from "../storefront/lib/starterVerdict.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- options -----------------------------------------------------------------

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const has = (name: string) => process.argv.includes(`--${name}`);

const BASE_URL = (flag("url") ?? process.env.STARTER_CHECK_URL ?? "http://localhost:3000").replace(/\/$/, "");
const LEVEL = flag("level") ?? "some";
const TIMEOUT_MS = Number(flag("timeout") ?? 20) * 1000;
const CONCURRENCY = Number(flag("concurrency") ?? 3);
const ALLOW_API = has("allow-api");
const JUDGE = !has("no-judge");
/** A directory of <lab>.lesson.json files, as this script writes them. Reruns those lessons instead of generating. */
const REPLAY = flag("replay");

if (!["new", "some", "shipped"].includes(LEVEL)) throw new Error(`--level must be new, some or shipped, not "${LEVEL}"`);

interface CorpusDoc {
  id: string;
  title: string;
  objectives: string[];
  mistakes: { id: string }[];
}
const corpus = JSON.parse(readFileSync(join(root, "storefront", "data", "tutor-corpus.json"), "utf8")) as CorpusDoc[];
const withMistakes = corpus.filter((d) => d.mistakes.length > 0);

const requested = flag("labs")?.split(",").map((s) => s.trim()).filter(Boolean);
const labs = requested ? withMistakes.filter((d) => requested.includes(d.id)) : withMistakes;
const unknown = requested?.filter((id) => !withMistakes.some((d) => d.id === id)) ?? [];
if (unknown.length) throw new Error(`No authored mistakes for: ${unknown.join(", ")}. Labs with mistakes: ${withMistakes.map((d) => d.id).join(", ")}`);

const outDir = join(root, "scratch", ".starter-check");
mkdirSync(outDir, { recursive: true });

// ---- 1. the lesson -------------------------------------------------------------

interface Lesson {
  title: string;
  exercise: { prompt: string; deliverable: string; rubric: string[] };
  starter?: { code: string; defects: { mistakeId: string; criterion: number }[] } | null;
}

async function generateLesson(doc: CorpusDoc): Promise<{ lesson: Lesson; costUsd: number; dropped: string[] }> {
  const session = {
    n: 1,
    // The route bounds these; the corpus title and objectives are what a real plan would cite.
    title: doc.title.slice(0, 160),
    minutes: 30,
    day: 1,
    labIds: [doc.id],
    objectives: doc.objectives.slice(0, 6).map((o) => o.slice(0, 240)),
    whyNow: "Starter check.",
  };
  const response = await fetch(`${BASE_URL}/api/tutor/lesson`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session, level: LEVEL, weakSpots: [] }),
  });
  const body = (await response.json().catch(() => null)) as
    | { lesson?: Lesson; meta?: { costUsd?: number; dropped?: string[] }; error?: string; detail?: string }
    | null;
  if (!response.ok || !body?.lesson) {
    const why = body?.detail ?? body?.error ?? `HTTP ${response.status}`;
    const hint = response.status === 401 ? " (BYOK enforcement is on; run against a storefront with it off)" : "";
    throw new Error(`lesson request failed: ${why}${hint}`);
  }
  return { lesson: body.lesson, costUsd: body.meta?.costUsd ?? 0, dropped: body.meta?.dropped ?? [] };
}

// ---- 2. the run ----------------------------------------------------------------

interface Run extends StarterRun {
  /** The starter tried to reach the API and had no key: nothing about its claims was tested. */
  neededApi: boolean;
}

const TSX_CLI = createRequire(import.meta.url).resolve("tsx/cli");

function runStarter(file: string): Promise<Run> {
  const env = { ...process.env };
  if (!ALLOW_API) delete env.ANTHROPIC_API_KEY;

  return new Promise((resolve) => {
    // Its own process group, so a timeout kills tsx AND the node process tsx starts.
    const child = spawn(process.execPath, [TSX_CLI, file], { cwd: root, env, detached: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        /* already gone */
      }
    }, TIMEOUT_MS);

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const neededApi = !ALLOW_API && /ANTHROPIC_API_KEY|apiKey|AuthenticationError|authentication_error/i.test(stderr);
      resolve({ exitCode: timedOut ? null : exitCode, timedOut, neededApi, stdout: capOutput(stdout), stderr: capOutput(stderr) });
    });
  });
}

// ---- 3. the comparison -----------------------------------------------------------
//
// The same verdict the lesson route asks for before serving a starter (storefront/lib/starterVerdict.ts), so a
// lesson that passed in production and a check run by hand are judged by one prompt.

/** Declared with the root's zod; the fields and their descriptions live in starterVerdict.ts. */
const StarterVerdictOutput = z.object({
  claims: z.array(z.string()).describe(STARTER_VERDICT_FIELDS.claims),
  consistent: z.boolean().describe(STARTER_VERDICT_FIELDS.consistent),
  mismatch: z.string().nullable().describe(STARTER_VERDICT_FIELDS.mismatch),
}) satisfies z.ZodType<StarterVerdict>;

async function judge(lesson: Lesson, run: Run): Promise<{ verdict: StarterVerdict; costUsd: number }> {
  const response = await anthropic.messages.parse({
    model: MODEL_TIERS.balanced,
    max_tokens: STARTER_JUDGE_MAX_TOKENS,
    output_config: { effort: "low", format: zodOutputFormat(StarterVerdictOutput) },
    messages: [
      {
        role: "user",
        content: starterVerdictPrompt(
          { prompt: lesson.exercise.prompt, code: lesson.starter!.code, run, timeoutSeconds: TIMEOUT_MS / 1000 },
          wrapUntrusted,
        ),
      },
    ],
  });
  if (!response.parsed_output) throw new Error(`judge returned no verdict (stop_reason: ${response.stop_reason})`);
  return { verdict: response.parsed_output, costUsd: summarizeUsage(response.usage, response.model).estimated_cost_usd };
}

// ---- the checks ------------------------------------------------------------------

type Status = "ok" | "flagged" | "no-starter" | "needs-api" | "error";

interface LabReport {
  lab: string;
  status: Status;
  notes: string[];
  planted: string[];
  dropped: string[];
  run?: Run;
  verdict?: StarterVerdict;
  starterFile?: string;
  costUsd: number;
}

function replayLesson(doc: CorpusDoc): { lesson: Lesson; costUsd: number; dropped: string[] } {
  const file = join(REPLAY!, `${doc.id}.lesson.json`);
  return { lesson: JSON.parse(readFileSync(file, "utf8")) as Lesson, costUsd: 0, dropped: [] };
}

async function check(doc: CorpusDoc): Promise<LabReport> {
  const report: LabReport = { lab: doc.id, status: "ok", notes: [], planted: [], dropped: [], costUsd: 0 };
  const flagged = (note: string) => {
    report.notes.push(note);
    if (report.status === "ok") report.status = "flagged";
  };

  try {
    const { lesson, costUsd, dropped } = REPLAY ? replayLesson(doc) : await generateLesson(doc);
    report.costUsd += costUsd;
    if (!REPLAY) writeFileSync(join(outDir, `${doc.id}.lesson.json`), `${JSON.stringify(lesson, null, 2)}\n`);

    report.dropped = dropped.filter((d) => d.startsWith("starter"));
    if (report.dropped.length) flagged(`dropped: ${report.dropped.join("; ")}`);

    if (!lesson.starter) {
      report.status = report.status === "flagged" ? "flagged" : "no-starter";
      // Buggy code pasted into the prompt instead of a starter is tracked by nothing.
      if (/```(ts|typescript|js|javascript)?\n/.test(lesson.exercise.prompt)) flagged("no starter, but the prompt contains a code block");
      return report;
    }
    report.planted = lesson.starter.defects.map((d) => d.mistakeId);

    report.starterFile = join(outDir, `${doc.id}.mts`);
    writeFileSync(report.starterFile, lesson.starter.code);
    report.run = await runStarter(report.starterFile);

    if (report.run.neededApi) {
      report.status = report.status === "flagged" ? "flagged" : "needs-api";
      report.notes.push("starter calls the API; rerun with --allow-api to check it");
      return report;
    }

    if (JUDGE) {
      const { verdict, costUsd: judgeCost } = await judge(lesson, report.run);
      report.verdict = verdict;
      report.costUsd += judgeCost;
      if (!verdict.consistent) flagged(verdict.mismatch ?? "judged inconsistent with its prompt");
    }
  } catch (error) {
    report.status = "error";
    report.notes.push(error instanceof Error ? error.message : String(error));
  }
  return report;
}

console.log(
  `Checking starters for ${labs.map((d) => d.id).join(", ")} ${REPLAY ? `replayed from ${REPLAY}` : `against ${BASE_URL}`}` +
    ` (level ${LEVEL}, ${ALLOW_API ? "API allowed" : "no API key"}, ${JUDGE ? "judged" : "not judged"})\n`,
);

const reports = await mapWithConcurrency(labs, CONCURRENCY, async (doc) => {
  const report = await check(doc);
  const run = report.run
    ? report.run.timedOut
      ? "timed out"
      : `exit ${report.run.exitCode}`
    : "not run";
  console.log(`${report.lab.padEnd(6)} ${report.status.padEnd(10)} ${run.padEnd(10)} planted: ${report.planted.join(", ") || "-"}`);
  for (const note of report.notes) console.log(`         - ${note}`);
  return report;
});

const reportFile = join(outDir, `report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(reportFile, `${JSON.stringify(reports, null, 2)}\n`);

const total = reports.reduce((sum, r) => sum + r.costUsd, 0);
const count = (s: Status) => reports.filter((r) => r.status === s).length;
console.log(
  `\n${count("ok")} ok, ${count("flagged")} flagged, ${count("error")} error, ` +
    `${count("no-starter")} without a starter, ${count("needs-api")} needing --allow-api. ` +
    `About $${total.toFixed(2)}, not counting any real calls the starters made.`,
);
console.log(`Lessons, starters and the full report: ${outDir}`);

process.exit(count("flagged") + count("error") > 0 ? 1 : 0);
