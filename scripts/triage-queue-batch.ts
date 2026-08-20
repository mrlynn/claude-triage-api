/**
 * The same twenty tickets, through the Batches API. `npm run triage:queue:batch`
 *
 * Northwind's queue is 4,100 tickets a week that nobody reads in real time.
 * That is the textbook batch workload, and the synchronous route this repo has
 * been using for it all along is the wrong tool — it just happens to be the
 * tool that was already there. Half price, and nobody is waiting.
 *
 * FOUR THINGS THIS DEMONSTRATES that a "call the API in a loop" script cannot:
 *
 * 1. `custom_id` IS THE TICKET ID. Results come back in ANY order, so you key
 *    by custom_id and never by position. Using an array index here would work
 *    on twenty tickets in development and silently mis-attribute
 *    classifications the first time the API reordered anything — the worst
 *    class of bug, because the output is well-formed and wrong.
 *
 * 2. THERE IS NO `parsed_output`. That convenience belongs to
 *    `messages.parse()`. A batch result hands you a message whose text the API
 *    guaranteed is schema-conformant, and the parse and validation are yours —
 *    exactly the same situation `routes/resolve.ts` is in with the tool
 *    runner, which is why both use `safeJson` + `safeParse`.
 *
 * 3. FOUR RESULT TYPES, not one. `succeeded | errored | canceled | expired`.
 *    A script that only handles the first will quietly drop tickets, and a
 *    dropped ticket in a triage backfill is a customer nobody replied to.
 *
 * 4. RECONCILIATION. Every custom_id submitted must appear in the results.
 *    Checking that is three lines and it is the difference between "the batch
 *    finished" and "the work is done".
 */
import "../src/lib/env.js";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { anthropic, assertCredentials } from "../src/anthropic.js";
import { MODEL } from "../src/config.js";
import { buildTriageRequest } from "../src/lib/requests.js";
import { summarizeUsage } from "../src/lib/usage.js";
import { safeJson } from "../src/lib/json.js";
import { TriageSchema, type TriageResult } from "../src/schemas.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

interface InboundTicket {
  id: string;
  received_at: string;
  channel: "email" | "chat" | "phone_transcript";
  customer_email: string;
  subject: string;
  message: string;
}

interface TriagedTicket extends InboundTicket {
  triage: TriageResult | null;
  cost_usd: number;
  /** Recorded so the batch-vs-sync comparison rests on evidence, not on a claim. */
  cache_hit: boolean;
  cache_read_tokens: number;
  error?: string;
}

const POLL_START_MS = 5_000;
const POLL_MAX_MS = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  assertCredentials();

  const tickets: InboundTicket[] = JSON.parse(
    readFileSync(join(root, "data", "inbound-queue.json"), "utf8"),
  );

  // Uniqueness is asserted, not assumed. A duplicate custom_id means two
  // tickets collapse into one result and you find out by noticing a missing
  // row much later, if at all.
  const ids = new Set(tickets.map((t) => t.id));
  if (ids.size !== tickets.length) {
    throw new Error(
      `Duplicate ticket ids in inbound-queue.json: ${tickets.length} tickets, ${ids.size} unique ids.`,
    );
  }

  console.log(`\nBatch triage — ${tickets.length} tickets, model ${MODEL}\n`);

  const requests = tickets.map((t) => ({
    // The ticket id, never an array index. Already unique, survives
    // reordering, and it is what you reconcile against the source.
    custom_id: t.id,
    params: buildTriageRequest({
      message: `${t.subject}\n\n${t.message}`,
      customer_email: t.customer_email,
      channel: t.channel,
    }),
  }));

  const submitted = Date.now();
  const batch = await anthropic.messages.batches.create({ requests });
  console.log(`  submitted: ${batch.id}`);

  // Poll with backoff. The SLA is 24 hours; in practice a batch this small
  // finishes in minutes, and hammering retrieve() every second to find out is
  // the behaviour the backoff exists to discourage.
  let wait = POLL_START_MS;
  let status = batch.processing_status;
  while (status !== "ended") {
    await sleep(wait);
    wait = Math.min(Math.floor(wait * 1.5), POLL_MAX_MS);
    const current = await anthropic.messages.batches.retrieve(batch.id);
    status = current.processing_status;
    const c = current.request_counts;
    process.stdout.write(
      `\r  ${status}  succeeded=${c.succeeded} errored=${c.errored} processing=${c.processing}   `,
    );
  }
  const elapsedSec = Math.round((Date.now() - submitted) / 1000);
  console.log(`\n  ended after ${elapsedSec}s\n`);

  const byId = new Map<string, TriagedTicket>();
  let totalCost = 0;
  let succeeded = 0;
  let cacheHits = 0;

  for await (const result of await anthropic.messages.batches.results(batch.id)) {
    const ticket = tickets.find((t) => t.id === result.custom_id);
    if (!ticket) {
      // A result for something we did not submit. Should be impossible; say
      // so loudly rather than skipping it.
      console.error(`  UNEXPECTED result for unknown custom_id ${result.custom_id}`);
      continue;
    }

    // All four result types. Anything not handled here is a dropped ticket.
    if (result.result.type !== "succeeded") {
      byId.set(ticket.id, {
        ...ticket,
        triage: null,
        cost_usd: 0,
        cache_hit: false,
        cache_read_tokens: 0,
        error: result.result.type,
      });
      continue;
    }

    const message = result.result.message;
    const text = message.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("");

    // No parsed_output on a batch result — same position resolve.ts is in.
    const validated = TriageSchema.safeParse(safeJson(text));

    // The batch discount is applied in the cost math, not mentioned in a
    // comment: summarizeUsage takes { batch: true } and halves the rates.
    const usage = summarizeUsage(message.usage, message.model, { batch: true });
    totalCost += usage.estimated_cost_usd;

    if (!validated.success) {
      byId.set(ticket.id, {
        ...ticket,
        triage: null,
        cost_usd: usage.estimated_cost_usd,
        cache_hit: usage.cache_hit,
        cache_read_tokens: usage.cache_read_input_tokens,
        error: "unparseable_output",
      });
      continue;
    }

    succeeded++;
    if (usage.cache_hit) cacheHits++;
    byId.set(ticket.id, {
      ...ticket,
      triage: validated.data,
      cost_usd: usage.estimated_cost_usd,
      cache_hit: usage.cache_hit,
      cache_read_tokens: usage.cache_read_input_tokens,
    });
  }

  // Reconciliation. Three lines, and the difference between "the batch
  // finished" and "the work is done".
  const missing = tickets.filter((t) => !byId.has(t.id));
  if (missing.length > 0) {
    console.error(
      `  ${missing.length} submitted ticket(s) had no result: ${missing.map((t) => t.id).join(", ")}`,
    );
  }

  const failed = tickets.length - succeeded;
  console.log(`  succeeded: ${succeeded}/${tickets.length}`);
  console.log(`  cache hits: ${cacheHits}/${tickets.length}`);
  console.log(`  cost: $${totalCost.toFixed(4)} at half rate`);
  if (cacheHits < tickets.length / 2) {
    console.log(
      `\n  NOTE: most requests MISSED the prompt cache. The batch discount is 50%;\n` +
        `  a cache read is 90% off. Losing the second to gain the first is a net\n` +
        `  LOSS on a workload with a large stable prefix — which is this one.\n` +
        `  Compare against \`npm run triage:queue\`, which hits the cache 20/20.`,
    );
  }
  console.log(`  wall clock: ${elapsedSec}s\n`);

  const out = {
    generated_at: new Date().toISOString(),
    mode: "batch" as const,
    model: MODEL,
    total_cost_usd: Math.round(totalCost * 1e6) / 1e6,
    wall_clock_sec: elapsedSec,
    cache_hits: cacheHits,
    tickets: tickets.map(
      (t) =>
        byId.get(t.id) ?? {
          ...t,
          triage: null,
          cost_usd: 0,
          cache_hit: false,
          cache_read_tokens: 0,
          error: "missing",
        },
    ),
  };
  const dest = join(root, "website", "src", "data", "triaged-queue-batch.json");
  writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`  written: ${dest}\n`);

  // A backfill that silently dropped tickets must not look like a success.
  if (failed > 0 || missing.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
