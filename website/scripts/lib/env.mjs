/**
 * Read a secret from the environment, falling back to the repo-root .env
 * files. Shared so a script cannot invent its own lookup order and then
 * disagree with the docs about where a key is meant to live.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function fromEnv(names, repoRoot) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  for (const file of [".env.local", ".env"]) {
    const path = join(repoRoot, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      for (const name of names) {
        const m = line.match(new RegExp(`^${name}\\s*=\\s*"?([^"#\\s]+)`));
        if (m) return m[1];
      }
    }
  }
  return null;
}
