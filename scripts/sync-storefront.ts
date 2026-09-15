/**
 * The storefront deploys from its own Vercel root directory, so it cannot
 * reach anything above `storefront/` at build time — not `data/`, not `src/`,
 * not the root `package.json`. Whatever it needs must physically live inside
 * it and be committed.
 *
 * That leaves two honest options for shared material, and this script does
 * both:
 *
 *   1. COPY the data. `data/policies.md` is the same handbook the API caches.
 *   2. GENERATE the code. The pricing table has exactly one source of truth
 *      (src/config.ts). Rather than let the storefront keep its own hardcoded
 *      $5/$25 constants — which is what it did, and they had already drifted
 *      out of any relationship with the API — we emit a generated module.
 *
 * Generating is not the same as sharing logic. Only plain data crosses this
 * line. Behavior that must match (prompt wrapping, redaction) is hand-mirrored
 * with a header comment, so a reader can see there are two copies.
 *
 * Run after editing the handbook or the pricing table, and commit the result:
 *   npm run sync:storefront
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MODEL_CATALOG } from "../src/config.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Writes only when the content actually changed, so reruns are silent no-ops. */
function writeIfChanged(dest: string, body: string, label: string): boolean {
  let current: string | null = null;
  try {
    current = readFileSync(dest, "utf8");
  } catch {
    /* not there yet */
  }
  if (current === body) {
    console.log(`${label} is already current`);
    return false;
  }
  writeFileSync(dest, body);
  console.log(`updated ${label}`);
  return true;
}

// --- 1. the policy handbook -------------------------------------------------

writeIfChanged(
  join(root, "storefront", "data", "policies.md"),
  readFileSync(join(root, "data", "policies.md"), "utf8"),
  "storefront/data/policies.md",
);

// --- 2. the injection corpus ------------------------------------------------
//
// The playground's payload dropdown reads this. Only the presentational
// fields cross over: the red-team ASSERTIONS (must_not, expect_escalation)
// stay in the API repo, because they are test expectations and shipping them
// to a public page invites someone to read them as a list of what does work.

interface InjectionCase {
  id: string;
  family: string;
  message: string;
  benign?: boolean;
  /** Visitor-facing, one sentence. This is what the public page renders. */
  blurb: string;
  /** Corpus-authoring commentary, including why an assertion is shaped as it
   *  is. Useful to a learner reading the repo, wrong on a public page — so it
   *  deliberately does NOT cross this boundary. */
  notes: string;
}

const injections = readFileSync(join(root, "data", "injections.jsonl"), "utf8")
  .split("\n")
  .filter((l) => l.trim().length > 0)
  .map((l) => JSON.parse(l) as InjectionCase)
  .map(({ id, family, message, benign, blurb }) => ({
    id,
    family,
    message,
    benign: Boolean(benign),
    blurb,
  }));

writeIfChanged(
  join(root, "storefront", "data", "injections.json"),
  `${JSON.stringify(injections, null, 2)}\n`,
  "storefront/data/injections.json",
);

// --- 3. the demo queue ------------------------------------------------------
//
// The seven fictional tickets that escalate, so /queue is a teaching surface
// without a token. These are NW-T-10xx from data/inbound-queue.json — authored
// for the course, classified by the real route, and about nobody. The board is
// the thing worth showing; the real public submissions behind the token are
// the part that needs guarding, and conflating those two made a page that
// taught nothing to anyone without a credential.

interface TriagedTicket {
  id: string;
  received_at: string;
  channel: string;
  message: string;
  subject: string;
  triage: { requires_human: boolean } & Record<string, unknown>;
  cost_usd: number;
}

const triaged = JSON.parse(
  readFileSync(join(root, "website", "src", "data", "triaged-queue.json"), "utf8"),
) as { model: string; tickets: TriagedTicket[] };

const demoQueue = triaged.tickets
  .filter((t) => t.triage.requires_human)
  .map((t, i) => ({
    // Prefixed so a demo row can never be mistaken for a real one, in the UI
    // or in a screenshot.
    _id: `DEMO-${t.id}`,
    created_at: t.received_at,
    channel: t.channel,
    // Redacted on the way in, exactly as a real one would be. These are
    // fictional, so nothing is found — which is the point worth showing.
    message_redacted: `${t.subject}\n\n${t.message}`,
    redactions: [],
    triage: t.triage,
    // A spread of states so the board demonstrates the workflow rather than
    // one column of identical cards.
    status: i === 0 ? "claimed" : i === 1 ? "resolved" : "new",
    ...(i === 0 ? { claimed_by: "priya" } : {}),
    model: triaged.model,
    cost_usd: t.cost_usd,
  }));

writeIfChanged(
  join(root, "storefront", "data", "demo-queue.json"),
  `${JSON.stringify(demoQueue, null, 2)}\n`,
  "storefront/data/demo-queue.json",
);

// --- 4. the tutor corpus ----------------------------------------------------
//
// The Tutor builds cram plans and grades exercises, and it may only teach from
// the course. So the course crosses this line as data: the Messages API labs
// and the practical guides, each with its objectives, its prose, and the
// ```quiz items an author already wrote and the website build already checks.
//
// Lab 0 (baseline scoreboard) and Lab 10 (the capstone) stay out. Neither is
// an aspect of the API a learner can drill; both are projects.
//
// Diagrams, images and the site-only ```try/```receipt/```path widgets are
// stripped — they render on the site and are noise in a prompt. TypeScript
// fences stay, because the request bodies ARE the material.

interface QuizItem {
  question: string;
  options: string[];
  answer: number;
  explain: string;
  note?: string;
}

const TUTOR_SOURCES = [
  ["lab-1", "curriculum/labs/lab-1-first-call.md", "/docs/labs/lab-1-first-call"],
  ["lab-2", "curriculum/labs/lab-2-structured-outputs.md", "/docs/labs/lab-2-structured-outputs"],
  ["lab-3", "curriculum/labs/lab-3-tool-use.md", "/docs/labs/lab-3-tool-use"],
  ["lab-4", "curriculum/labs/lab-4-streaming.md", "/docs/labs/lab-4-streaming"],
  ["lab-5", "curriculum/labs/lab-5-prompt-caching.md", "/docs/labs/lab-5-prompt-caching"],
  ["lab-6", "curriculum/labs/lab-6-evals.md", "/docs/labs/lab-6-evals"],
  ["lab-7", "curriculum/labs/lab-7-choosing-a-model.md", "/docs/labs/lab-7-choosing-a-model"],
  ["lab-8", "curriculum/labs/lab-8-trust-boundary.md", "/docs/labs/lab-8-trust-boundary"],
  ["lab-9", "curriculum/labs/lab-9-shipping-it.md", "/docs/labs/lab-9-shipping-it"],
  ["guide-api", "curriculum/guides/claude-api-tutorial.md", "/docs/guides/claude-api-tutorial"],
  ["guide-structured", "curriculum/guides/structured-outputs-typescript-zod.md", "/docs/guides/structured-outputs-typescript-zod"],
  ["guide-tools", "curriculum/guides/claude-tool-use.md", "/docs/guides/claude-tool-use"],
  ["guide-caching", "curriculum/guides/prompt-caching-and-evals.md", "/docs/guides/prompt-caching-and-evals"],
] as const;

/** Per-document ceiling. The whole corpus is one cached prefix; this keeps the
 *  longest labs from crowding out the rest of it. */
const TUTOR_DOC_CHARS = 14_000;

const tutorCorpus = TUTOR_SOURCES.map(([id, source, path]) => {
  const raw = readFileSync(join(root, source), "utf8");
  const title = (raw.match(/^# (.+)$/m)?.[1] ?? id).replace(/`/g, "").trim();
  const time = raw.match(/^\*\*Time:\*\*\s*([^·\n]+)/m)?.[1]?.trim() ?? null;
  const objectives = (raw.match(/^## Objectives\n([\s\S]*?)(?=\n## |\n---|\n```)/m)?.[1] ?? "")
    .split("\n")
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim());

  const quizzes: QuizItem[] = [];
  const body = raw
    .replace(/^# .+\n/m, "")
    .replace(/```(\w*)\n([\s\S]*?)```/g, (block, lang: string, value: string) => {
      if (lang === "quiz") {
        const parsed = JSON.parse(value) as QuizItem | QuizItem[];
        quizzes.push(...(Array.isArray(parsed) ? parsed : [parsed]));
        return "";
      }
      return ["mermaid", "try", "receipt", "path"].includes(lang) ? "" : block;
    })
    .replace(/!\[[^\]]*\]\([^)]*\)\n?/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, TUTOR_DOC_CHARS);

  // Same rules remark-quiz.mjs enforces at site build time. A broken item
  // fails the sync here rather than reaching a learner as a drill with no
  // right answer.
  for (const q of quizzes) {
    if (!q.question || !Array.isArray(q.options) || q.answer < 0 || q.answer >= q.options.length) {
      throw new Error(`${source}: invalid quiz item "${q.question}"`);
    }
  }

  return { id, title, path, time, objectives, quizzes, body };
});

writeIfChanged(
  join(root, "storefront", "data", "tutor-corpus.json"),
  `${JSON.stringify(tutorCorpus, null, 2)}\n`,
  "storefront/data/tutor-corpus.json",
);

// --- 5. the pricing table ---------------------------------------------------

const generated = `/**
 * GENERATED FILE — do not edit.
 *
 * Source of truth: src/config.ts (MODEL_CATALOG) in the API repo.
 * Regenerate with \`npm run sync:storefront\` from the repo root.
 *
 * This exists because storefront/ deploys from its own Vercel root directory
 * and cannot import from ../src at build time. Before it existed, this app
 * carried its own hardcoded $5/$25 rates and there was nothing keeping them
 * honest.
 */

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheWriteMultiplier: number;
  cacheReadMultiplier: number;
  batchMultiplier: number;
  /** Haiku 4.5 rejects \`output_config.effort\` with a 400. */
  supportsEffort: boolean;
}

export const PRICING_BY_MODEL: Record<string, ModelPricing> = ${JSON.stringify(
  Object.fromEntries(
    Object.entries(MODEL_CATALOG).map(([id, spec]) => [
      id,
      {
        inputPerMTok: spec.inputPerMTok,
        outputPerMTok: spec.outputPerMTok,
        cacheWriteMultiplier: spec.cacheWriteMultiplier,
        cacheReadMultiplier: spec.cacheReadMultiplier,
        batchMultiplier: spec.batchMultiplier,
        supportsEffort: spec.supportsEffort,
      },
    ]),
  ),
  null,
  2,
)};

/** Throws on an unknown model rather than guessing flagship rates. */
export function pricingFor(model: string): ModelPricing {
  const exact = PRICING_BY_MODEL[model];
  if (exact) return exact;
  const undated = PRICING_BY_MODEL[model.replace(/-\\d{8}$/, "")];
  if (undated) return undated;
  throw new Error(
    \`No pricing for model "\${model}". Add it to MODEL_CATALOG in src/config.ts \` +
      \`and re-run npm run sync:storefront.\`,
  );
}
`;

writeIfChanged(
  join(root, "storefront", "lib", "pricing.generated.ts"),
  generated,
  "storefront/lib/pricing.generated.ts",
);
