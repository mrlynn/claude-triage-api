/**
 * Claude Triage API — a teaching-grade reference service.
 *
 * Four routes, four capabilities, one domain:
 *   POST /v1/triage    structured outputs   (constrained, validated JSON)
 *   POST /v1/resolve   tool use             (agentic loop over your systems)
 *   POST /v1/draft     streaming            (SSE, token-by-token)
 *   POST /v1/estimate  token counting       (cost projection, no inference)
 *
 * Read them in that order — each one adds exactly one new idea.
 */
import "./lib/env.js";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { PORT, MODEL, EFFORT } from "./config.js";
import { assertCredentials } from "./anthropic.js";
import { triageRoute } from "./routes/triage.js";
import { resolveRoute } from "./routes/resolve.js";
import { draftRoute } from "./routes/draft.js";
import { estimateRoute } from "./routes/estimate.js";
import { limitsRoute } from "./routes/limits.js";

export const app = new Hono();

app.use("*", logger());

app.get("/", (c) =>
  c.json({
    service: "claude-triage-api",
    model: MODEL,
    effort_by_route: EFFORT,
    routes: {
      "POST /v1/triage": "Classify a ticket into a validated schema (structured outputs).",
      "POST /v1/resolve": "Decide what to do, using tools to look up orders, accounts, and policy.",
      "POST /v1/draft": "Stream a customer-ready reply over SSE.",
      "POST /v1/estimate": "Count tokens and project cost without calling the model.",
      "GET /v1/limits": "The rate-limit headers from the most recent upstream call.",
      "GET /healthz": "Liveness.",
    },
    docs: "See README.md and curriculum/ for the labs.",
  }),
);

app.get("/healthz", (c) => c.json({ ok: true }));

app.route("/v1/triage", triageRoute);
app.route("/v1/resolve", resolveRoute);
app.route("/v1/draft", draftRoute);
app.route("/v1/estimate", estimateRoute);
app.route("/v1/limits", limitsRoute);

app.notFound((c) => c.json({ error: "not_found", detail: "No such route." }, 404));

// Only start a listener when run directly, so tests and the eval harness can
// import `app` without binding a port.
if (import.meta.url === `file://${process.argv[1]}`) {
  assertCredentials();
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`\n  claude-triage-api  ->  http://localhost:${info.port}`);
    console.log(`  model: ${MODEL}\n`);
  });
}
