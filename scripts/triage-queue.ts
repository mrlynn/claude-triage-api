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

  const out: unknown[] = [];
  let totalCost = 0;

  for (const [i, ticket] of tickets.entries()) {
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
      continue;
    }

    const body = (await res.json()) as {
      triage: TriageResult;
      meta: { usage: { estimated_cost_usd: number; cache_hit: boolean } };
    };

    totalCost += body.meta.usage.estimated_cost_usd;

    out.push({
      ...ticket,
      triage: body.triage,
      cost_usd: body.meta.usage.estimated_cost_usd,
      cache_hit: body.meta.usage.cache_hit,
      latency_ms: Date.now() - started,
    });

    console.log(
      `  ${String(i + 1).padStart(2)}/${tickets.length}  ${ticket.id}  ` +
        `${body.triage.category.padEnd(15)} ${body.triage.urgency.padEnd(7)} ` +
        `conf=${body.triage.confidence.toFixed(2)}` +
        `${body.triage.requires_human ? "  [human]" : ""}`,
    );
  }

  const target = join(repoRoot, "website", "src", "data");
  mkdirSync(target, { recursive: true });
  writeFileSync(
    join(target, "triaged-queue.json"),
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        model: process.env.TRIAGE_MODEL ?? "claude-opus-5",
        total_cost_usd: Math.round(totalCost * 1e6) / 1e6,
        tickets: out,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`\n  ${out.length} tickets triaged for $${totalCost.toFixed(4)}`);
  console.log(`  wrote website/src/data/triaged-queue.json\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
