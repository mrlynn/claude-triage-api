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

// --- 3. the pricing table ---------------------------------------------------

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
