/**
 * End-to-end smoke test. Exercises all four routes in-process (no port bind)
 * and proves the prompt cache is actually working.
 *
 * Run with:  npm run smoke
 */
import "../src/lib/env.js";
import { app } from "../src/server.js";
import { assertCredentials } from "../src/anthropic.js";

const TICKET = {
  message:
    "Order NW-48211 arrived last week and the jacket's main zipper separated the second time I wore it. I'd like a replacement, not store credit.",
  customer_email: "dana.k@example.com",
};

async function post(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function head(title: string) {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}

/**
 * Collected rather than thrown, so one failure does not hide the next four.
 * A smoke test that stops at the first problem makes you run it five times to
 * learn what a single run could have told you.
 */
const failures: string[] = [];
function check(condition: unknown, message: string): void {
  if (condition) return;
  failures.push(message);
  console.error(`  ASSERTION FAILED: ${message}`);
}

async function main() {
  assertCredentials();

  head("1. POST /v1/estimate — token counting, no inference");
  const est = await (await post("/v1/estimate", { message: TICKET.message })).json();
  console.log(JSON.stringify(est, null, 2));
  check(
    (est as any).tokens?.prefix_meets_cache_minimum,
    "cacheable prefix is under 1024 tokens — the API will silently decline to " +
      "cache it, with no error. Lengthen data/policies.md.",
  );

  head("2. POST /v1/triage — structured outputs (call 1, cold cache)");
  const t1 = (await (await post("/v1/triage", TICKET)).json()) as any;
  console.log(JSON.stringify(t1, null, 2));
  check(t1.triage?.category, "triage returned no category — the schema did not validate");
  check(
    t1.triage?.entities?.order_ids?.includes("NW-48211"),
    "triage did not extract order NW-48211 from a message that names it",
  );

  head("3. POST /v1/triage — same prefix (call 2, cache should be WARM)");
  const t2 = (await (await post("/v1/triage", TICKET)).json()) as any;
  console.log(JSON.stringify(t2.meta.usage, null, 2));
  console.log(
    t2.meta.usage.cache_hit
      ? `\n  CACHE HIT — ${t2.meta.usage.cache_read_input_tokens} tokens read from cache, ` +
          `saving $${t2.meta.usage.savings_usd.toFixed(5)} on this call alone.`
      : "\n  CACHE MISS — see curriculum/labs/lab-5-prompt-caching.md for the audit checklist.",
  );
  // THE ASSERTION THIS SCRIPT EXISTED WITHOUT. A cache miss on two
  // identical-prefix calls means something is invalidating the prefix, and it
  // is the single most expensive silent failure in the repo — it does not
  // error, it just multiplies the bill by five. Printing "CACHE MISS" and
  // exiting 0 made this a demo; failing makes it a test.
  check(
    t2.meta.usage.cache_hit,
    "second identical-prefix call did not hit the cache — something in the " +
      "prefix is varying (a timestamp, a rebuilt tool list, a reordered schema)",
  );

  head("4. POST /v1/resolve — tool-use agentic loop");
  const r = (await (await post("/v1/resolve", TICKET)).json()) as any;
  console.log("resolution:", JSON.stringify(r.resolution, null, 2));
  console.log(
    "\ntools called, in order:",
    (r.tool_trace ?? []).map((t: any) => t.tool).join(" -> ") || "(none)",
  );
  console.log(
    `\niterations: ${r.meta?.iterations}  cost: $${r.meta?.usage_total?.estimated_cost_usd}`,
  );

  let sawDone = false;
  head("5. POST /v1/draft — streaming");
  const res = await post("/v1/draft", TICKET);
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const ev = frame.split("\n").find((l) => l.startsWith("event: "))?.slice(7);
      const data = frame.split("\n").find((l) => l.startsWith("data: "))?.slice(6);
      if (!data) continue;
      if (ev === "text") process.stdout.write(JSON.parse(data).text);
      if (ev === "done") {
        sawDone = true;
        console.log(`\n\n[done] ${JSON.stringify(JSON.parse(data).usage)}`);
      }
      if (ev === "error") console.error(`\n\n[error] ${data}`);
    }
  }

  check(
    sawDone,
    "the SSE stream never emitted a terminal `done` event — a client waiting " +
      "for it would hang forever",
  );
  check(
    (r as any).meta?.guardrails,
    "resolve returned no meta.guardrails — the authority and citation checks did not run",
  );

  if (failures.length > 0) {
    console.error(`\n\n${failures.length} assertion(s) failed:`);
    for (const f of failures) console.error(`  - ${f}`);
    console.error("");
    process.exit(1);
  }

  console.log("\n\nSmoke test complete — all assertions passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
