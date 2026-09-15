/**
 * Where the other half of this project lives.
 *
 * The storefront host was hardcoded in seven places — the navbar, two footer
 * entries, three playground tiles and the injection page — so moving it to its
 * own domain meant finding all seven. One constant, imported by both the
 * Docusaurus config and the React pages, so there is one place to change.
 *
 * Deliberately NOT read from the environment: Docusaurus only inlines
 * NODE_ENV into the client bundle, so a `process.env` read at module scope
 * here would be `undefined` in the browser and produce links to "undefined".
 * The site's own URL is the one that genuinely varies per deploy target, and
 * that already has DOCS_SITE_URL in docusaurus.config.ts.
 */
export const STOREFRONT_URL = "https://northwind.mlynn.dev";

/** A path on the storefront, e.g. `storefront("/support")`. */
export function storefront(path = ""): string {
  return `${STOREFRONT_URL}${path}`;
}

/**
 * Where the browser sends API calls that need the storefront's key — Ask
 * Northwind and the Tutor. A function, not a constant, because it reads
 * `window`: the course and storefront run on separate local ports in
 * `npm run dev:all`, and a learner running the workshop locally must never
 * make a production cross-origin call. Call it only from the browser.
 */
export function storefrontApi(): string {
  return window.location.hostname === "localhost" ? "http://localhost:3002" : STOREFRONT_URL;
}
