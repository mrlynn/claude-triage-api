/**
 * Build the Vercel Sandbox snapshot the Tutor runs starters from.
 *
 *   cd storefront
 *   vercel env pull .env.local            # a fresh VERCEL_OIDC_TOKEN, if needed
 *   npx tsx scripts/create-starter-snapshot.mts
 *
 * Then set STARTER_SANDBOX_SNAPSHOT_ID to the id it prints, in the Vercel
 * project and in .env.local. Rebuild when the storefront's @anthropic-ai/sdk
 * or zod version moves, so starters run against what the course teaches.
 *
 * WHY A SNAPSHOT: starters run with `networkPolicy: "deny-all"`, and installing
 * packages needs the network. So the packages are installed once, here, with
 * network, and every starter sandbox boots from the result with none. The
 * snapshot is kept indefinitely (`expiration: 0`); the default would delete it
 * 30 days after it was last used, and a quiet month would silently turn
 * verification off.
 *
 * Plain driver, no app imports: this runs outside Next, and lib/starterSandbox
 * would drag `server-only` along with it.
 */
import { existsSync, readFileSync } from "node:fs";
import { Sandbox } from "@vercel/sandbox";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const own = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string> };
const rootPackage = JSON.parse(readFileSync("../package.json", "utf8")) as { devDependencies: Record<string, string> };

// The versions the storefront and the course pin, so a starter behaves in the sandbox as it does for a learner.
const manifest = {
  name: "tutor-starter-sandbox",
  private: true,
  type: "module",
  dependencies: {
    "@anthropic-ai/sdk": own.dependencies["@anthropic-ai/sdk"],
    zod: own.dependencies.zod,
    tsx: rootPackage.devDependencies.tsx,
  },
};
for (const [name, version] of Object.entries(manifest.dependencies)) {
  if (!version) throw new Error(`No version for ${name}: check storefront/package.json and the root package.json.`);
}

const WORKDIR = "/vercel/sandbox";

console.log("Creating a sandbox with network access to install:", manifest.dependencies);
const sandbox = await Sandbox.create({ timeout: 10 * 60_000, resources: { vcpus: 2 } });

try {
  await sandbox.writeFiles([{ path: `${WORKDIR}/package.json`, content: `${JSON.stringify(manifest, null, 2)}\n` }]);

  const install = await sandbox.runCommand("sh", ["-c", `cd ${WORKDIR} && npm install --no-audit --no-fund`]);
  if (install.exitCode !== 0) throw new Error(`npm install failed:\n${await install.stderr()}`);

  // Prove the snapshot can do what a starter needs before keeping it: TypeScript through `node --import tsx`, exactly
  // as lib/starterSandbox.ts runs starters, and both packages importable.
  await sandbox.writeFiles([
    {
      path: `${WORKDIR}/probe.mts`,
      content: `import Anthropic from "@anthropic-ai/sdk";\nimport { z } from "zod";\nconst n: number = z.number().parse(1);\nconsole.log("ok", n, typeof Anthropic);\n`,
    },
  ]);
  const probe = await sandbox.runCommand("sh", ["-c", `cd ${WORKDIR} && node --import tsx probe.mts && rm probe.mts`]);
  const probeOut = (await probe.stdout()).trim();
  if (probe.exitCode !== 0 || probeOut !== "ok 1 function") {
    throw new Error(`probe failed (exit ${probe.exitCode}): ${probeOut}\n${await probe.stderr()}`);
  }

  const snapshot = await sandbox.snapshot({ expiration: 0 });
  console.log(`\nSnapshot ready. Set this in the Vercel project and in storefront/.env.local:\n\nSTARTER_SANDBOX_SNAPSHOT_ID=${snapshot.snapshotId}\n`);
} catch (error) {
  await sandbox.stop().catch(() => undefined);
  throw error;
}
