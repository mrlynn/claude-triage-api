/**
 * Runs the whole inbound queue through the real /v1/triage route and writes
 * the results where the docs site can render them.
 *
 * WHY THIS EXISTS: the queue demo on the site could have been hand-authored
 * with plausible-looking classifications. It is not. Every field it renders
 * came out of claude-opus-5 through the same code path a learner runs, which
 * means the demo is honest, reproducible, and will change if the prompts or
 * the schema change.
 *
 * Costs roughly $0.12 to regenerate.
 *
 *   npm run triage:queue
 */
import "../src/lib/env.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { app } from "../src/server.js";
import { mapWithConcurrency } from "../src/lib/pool.js";
import { assertCredentials } from "../src/anthropic.js";
import type { TriageResult } from "../src/schemas.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

interface InboundTicket {
  id: string;
  received_at: string;
  channel: "email" | "chat" | "phone_transcript";
  customer_email: string;
  subject: string;
  message: string;
}

const tickets: InboundTicket[] = JSON.parse(
  readFileSync(join(repoRoot, "data", "inbound-queue.json"), "utf8"),
);

async function main() {
  assertCredentials();

  // Concurrency defaults to 1, preserving the serial behaviour this script has
  // always had. Lab 9 turns it up and measures what changes (wall clock) and
  // what does not (cost per ticket) — the second half is the point: parallelism
  // buys latency, never price. Only batching buys price.
  const cIdx = process.argv.indexOf("--concurrency");
  const concurrency = cIdx >= 0 ? Number(process.argv[cIdx + 1]) || 1 : 1;

  let totalCost = 0;
  let failures = 0;
  const startedAll = Date.now();

  console.log(`  concurrency: ${concurrency}${concurrency === 1 ? " (serial)" : ""}\n`);

  const out = await mapWithConcurrency(tickets, concurrency, async (ticket, i) => {
    const started = Date.now();
    const res = await app.request("/v1/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `${ticket.subject}\n\n${ticket.message}`,
        customer_email: ticket.customer_email,
        channel: ticket.channel,
      }),
    });

    if (!res.ok) {
      console.error(`  FAIL ${ticket.id}: HTTP ${res.status}`);
      failures++;
      return null;
    }

    const body = (await res.json()) as {
      triage: TriageResult;
      meta: { usage: { estimated_cost_usd: number; cache_hit: boolean } };
    };

    totalCost += body.meta.usage.estimated_cost_usd;

    console.log(
      `  ${String(i + 1).padStart(2)}/${tickets.length}  ${ticket.id}  ` +
        `${body.triage.category.padEnd(15)} ${body.triage.urgency.padEnd(7)} ` +
        `conf=${body.triage.confidence.toFixed(2)}` +
        `${body.triage.requires_human ? "  [human]" : ""}`,
    );

    return {
      ...ticket,
      triage: body.triage,
      cost_usd: body.meta.usage.estimated_cost_usd,
      cache_hit: body.meta.usage.cache_hit,
      latency_ms: Date.now() - started,
    };
  });

  const triaged = out.filter((x) => x !== null);
  const wallClockSec = Math.round((Date.now() - startedAll) / 1000);

  const target = join(repoRoot, "website", "src", "data");
  mkdirSync(target, { recursive: true });
  writeFileSync(
    join(target, "triaged-queue.json"),
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        model: process.env.TRIAGE_MODEL ?? "claude-opus-5",
        mode: concurrency === 1 ? "sync-serial" : `sync-concurrent-${concurrency}`,
        total_cost_usd: Math.round(totalCost * 1e6) / 1e6,
        wall_clock_sec: wallClockSec,
        tickets: triaged,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    `\n  ${triaged.length}/${tickets.length} tickets triaged for $${totalCost.toFixed(4)} ` +
      `in ${wallClockSec}s`,
  );
  console.log(`  wrote website/src/data/triaged-queue.json\n`);

  // A run that silently skipped tickets used to exit 0, which made this
  // unusable as anything but a demo: a partial backfill reported success.
  if (failures > 0) {
    console.error(`  ${failures} ticket(s) failed and were not written.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
