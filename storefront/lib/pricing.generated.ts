/**
 * GENERATED FILE — do not edit.
 *
 * Source of truth: src/config.ts (MODEL_CATALOG) in the API repo.
 * Regenerate with `npm run sync:storefront` from the repo root.
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

export const PRICING_BY_MODEL: Record<string, ModelPricing> = {
  "claude-opus-5": {
    "inputPerMTok": 5,
    "outputPerMTok": 25,
    "cacheWriteMultiplier": 1.25,
    "cacheReadMultiplier": 0.1,
    "batchMultiplier": 0.5
  },
  "claude-sonnet-5": {
    "inputPerMTok": 2,
    "outputPerMTok": 10,
    "cacheWriteMultiplier": 1.25,
    "cacheReadMultiplier": 0.1,
    "batchMultiplier": 0.5
  },
  "claude-haiku-4-5": {
    "inputPerMTok": 1,
    "outputPerMTok": 5,
    "cacheWriteMultiplier": 1.25,
    "cacheReadMultiplier": 0.1,
    "batchMultiplier": 0.5
  }
};

/** Throws on an unknown model rather than guessing flagship rates. */
export function pricingFor(model: string): ModelPricing {
  const exact = PRICING_BY_MODEL[model];
  if (exact) return exact;
  const undated = PRICING_BY_MODEL[model.replace(/-\d{8}$/, "")];
  if (undated) return undated;
  throw new Error(
    `No pricing for model "${model}". Add it to MODEL_CATALOG in src/config.ts ` +
      `and re-run npm run sync:storefront.`,
  );
}
