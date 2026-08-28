import { existsSync, readFileSync } from "node:fs";

// Local `dev:all` runs this service from the repository root. Production
// injects secrets normally; this tiny loader only makes the existing root
// `.env` work for the fourth local process too.
for (const filename of [".env.local", ".env"]) {
  if (!existsSync(filename)) continue;
  for (const line of readFileSync(filename, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1] in process.env) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}
