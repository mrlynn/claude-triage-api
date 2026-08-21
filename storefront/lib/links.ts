/**
 * Where the other half of this project lives.
 *
 * WHY A MODULE: the labs URL was hardcoded in nine places across the
 * storefront — the banner, the footer, the ops dashboard, five pipeline stage
 * explainers and two CTAs. Moving the site to its own domain meant editing all
 * nine and hoping none were missed, which is the kind of change that leaves one
 * dead link in a stage tooltip nobody clicks for a month.
 *
 * WHY ENV-OVERRIDABLE: `NEXT_PUBLIC_` is inlined at build time, so a preview
 * deployment can point at a preview of the labs site without a code change.
 * The default is the production host, so nothing has to be configured for the
 * common case.
 */
export const LABS_URL =
  process.env.NEXT_PUBLIC_LABS_URL || "https://triage.mlynn.dev";

/** A path on the labs site, e.g. `labs("/docs/scenario")`. */
export function labs(path = ""): string {
  return `${LABS_URL}${path}`;
}

/**
 * This site's own origin, for `metadataBase` and absolute OG image URLs.
 *
 * Vercel sets VERCEL_PROJECT_PRODUCTION_URL to whatever domain the project is
 * actually serving, so once northwind.mlynn.dev is attached in the dashboard
 * this follows it with no code change and no stale hostname baked into the
 * social cards. Falls back to localhost so `next dev` produces usable URLs.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");
