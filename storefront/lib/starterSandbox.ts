import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Sandbox } from "@vercel/sandbox";
import { redactSecrets } from "./secrets";
import { capOutput, type StarterRun } from "./starterVerdict";

/**
 * Runs a Tutor starter before a learner sees it.
 *
 * A starter is code a model wrote, run on our account. It runs in a Vercel
 * Sandbox microVM with `networkPolicy: "deny-all"` — no egress, not even DNS —
 * and no environment variables, so there is nothing to exfiltrate and nowhere
 * to send it. The starter rules already require a mock instead of the real API;
 * this is what enforces it.
 *
 * Dependencies come from a snapshot, because installing them needs the network
 * this sandbox does not have. Build one with
 * `npx tsx storefront/scripts/create-starter-snapshot.ts` and set
 * STARTER_SANDBOX_SNAPSHOT_ID. Without it, `starterSandboxReady()` is false and
 * lessons are served unverified, exactly as before verification existed: a
 * missing sandbox degrades the check, never the lesson.
 */

/** Long enough for a mock with timers to finish; a starter that needs more is hanging, and that is a finding. */
export const STARTER_RUN_SECONDS = 15;

/** Where the snapshot's package.json and node_modules live, and where the starter is written. */
const WORKDIR = "/vercel/sandbox";

export function starterSandboxReady(): boolean {
  return Boolean(process.env.STARTER_SANDBOX_SNAPSHOT_ID);
}

// Starters that stand in for the handbook load the real one, per the starter rules.
let handbook: string | null = null;
function policies(): string {
  handbook ??= readFileSync(join(process.cwd(), "data", "policies.md"), "utf8");
  return handbook;
}

/**
 * Runs `code` once and reports what happened. Returns null when the sandbox
 * itself failed — creation, upload, the platform — because that says nothing
 * about the starter, and a lesson should not be redrafted over it.
 */
export async function runStarterInSandbox(code: string): Promise<StarterRun | null> {
  const snapshotId = process.env.STARTER_SANDBOX_SNAPSHOT_ID;
  if (!snapshotId) return null;

  let sandbox: Sandbox | null = null;
  try {
    sandbox = await Sandbox.create({
      source: { type: "snapshot", snapshotId },
      networkPolicy: "deny-all",
      // Nothing to keep: without this the platform saves the filesystem on stop, and every lesson would leave a snapshot.
      persistent: false,
      resources: { vcpus: 1 },
      // Creation, upload, the run and a margin. The platform kills it after this whatever happens here.
      timeout: 60_000,
    });
    await sandbox.writeFiles([
      { path: `${WORKDIR}/starter.mts`, content: code },
      { path: `${WORKDIR}/data/policies.md`, content: policies() },
    ]);
  } catch (error) {
    console.error("starter sandbox unavailable; serving unverified", redactSecrets(error));
    await sandbox?.stop().catch(() => undefined);
    return null;
  }

  try {
    // The kill happens inside the VM with coreutils `timeout`: the SDK's own timeoutMs let a `while (true) {}` starter run
    // until the sandbox's 60-second lifetime ended it, and that minute would have been added to the learner's wait.
    // -k: a process that ignores SIGTERM is killed two seconds later. `node --import tsx`, not the tsx CLI: the CLI runs
    // the script in a child process, so killing it left a SIGTERM-ignoring starter running until the VM's lifetime ran
    // out. One process is one thing to kill. The SDK limit stays as a backstop.
    const finished = await sandbox.runCommand(
      "sh",
      ["-c", `cd ${WORKDIR} && exec timeout -k 2 ${STARTER_RUN_SECONDS} node --import tsx starter.mts`],
      { timeoutMs: (STARTER_RUN_SECONDS + 10) * 1_000 },
    );
    const [stdout, stderr] = await Promise.all([finished.stdout(), finished.stderr()]);
    // `timeout` exits 124 when it stopped the command, 137 when it had to SIGKILL it.
    const timedOut = finished.exitCode === 124 || finished.exitCode === 137;
    return {
      exitCode: timedOut ? null : finished.exitCode,
      timedOut,
      stdout: capOutput(stdout),
      stderr: capOutput(stderr),
    };
  } catch (error) {
    console.error("starter sandbox run failed; serving unverified", redactSecrets(error));
    return null;
  } finally {
    await sandbox.stop().catch(() => undefined);
  }
}
