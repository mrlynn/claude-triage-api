/**
 * The storefront deploys from its own Vercel root directory, so it cannot
 * reach data/policies.md at build time. It keeps a vendored copy instead.
 *
 * Run this after editing the canonical handbook, and commit the result:
 *   npm run sync:storefront
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "data", "policies.md");
const dest = join(root, "storefront", "data", "policies.md");

const body = readFileSync(src, "utf8");
const current = (() => {
  try {
    return readFileSync(dest, "utf8");
  } catch {
    return null;
  }
})();

if (current === body) {
  console.log("storefront policy copy is already current");
} else {
  writeFileSync(dest, body);
  console.log("updated storefront/data/policies.md from data/policies.md");
}
