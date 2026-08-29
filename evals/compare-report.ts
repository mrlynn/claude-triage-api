/**
 * Merge comparison envelopes into one table. `npm run eval:compare:report`
 *
 *   npm run eval:compare:report -- evals/results/compare-claude-messages-*.json \
 *                                  ../cursor-triage-api/evals/results/compare-cursor-agent-*.json
 *   npm run eval:compare:report -- <a.json> <b.json> --out docs/comparison-run.md
 *
 * Makes NO network calls and holds NO SDK. It reads finished envelopes and
 * stitches them by case id, which is what lets each runtime be measured on
 * its own machine, its own key and its own process — see the header of
 * lib/envelope.ts for why that separation is the whole design.
 *
 * THE THREE THINGS THIS REPORT REFUSES TO DO, each of which would make it
 * shorter and each of which would make it a lie:
 *
 *   1. It will not merge envelopes whose `envelope_version` disagrees. Two
 *      repos drift; a table whose columns mean different things per row is
 *      worse than no table, because it still looks right.
 *
 *   2. It will not difference or rank costs across differing `basis` values.
 *      An estimate off a checked-in price table and a settled figure from a
 *      billing API are not the same kind of number. They print as separate
 *      rows, each under its own basis, and the reader does the judging.
 *
 *   3. It will not print an accuracy percentage without the sample size and
 *      the caveat attached. Three cases cannot support a percentage anyone
 *      should quote, and the disagreement matrix below is the output that
 *      actually answers "would I ship this".
 */
import { readFileSync, writeFileSync } from "node:fs";
import { ENVELOPE_VERSION, fmtOrNa, type ComparisonEnvelope, type EnvelopeCase } from "./lib/envelope.js";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : null;
}

function load(paths: string[]): ComparisonEnvelope[] {
  const envelopes = paths.map((p) => {
    const parsed = JSON.parse(readFileSync(p, "utf8")) as ComparisonEnvelope;
    if (parsed.envelope_version !== ENVELOPE_VERSION) {
      throw new Error(
        `${p} is envelope_version ${parsed.envelope_version}; this report reads ` +
          `${ENVELOPE_VERSION}. Re-run eval:compare in that repo, or pin both repos ` +
          `to the same envelope version — do NOT merge across versions.`,
      );
    }
    return parsed;
  });

  const ids = new Set(envelopes.map((e) => e.runtime));
  if (ids.size !== envelopes.length) {
    throw new Error("Two envelopes report the same `runtime`. Pass one per runtime.");
  }
  return envelopes;
}

/** Per-case pass count across repeats, for the disagreement matrix. */
function tally(env: ComparisonEnvelope, caseId: string): { pass: number; of: number; worst: EnvelopeCase | null } {
  const rows = env.cases.filter((c) => c.id === caseId);
  const pass = rows.filter((c) => c.outcome === "pass").length;
  // Show the most interesting failure, preferring an unparseable one: a
  // schema miss says something a wrong category does not.
  const worst =
    rows.find((c) => c.outcome === "unparseable") ??
    rows.find((c) => c.outcome === "transport_error") ??
    rows.find((c) => c.outcome === "fail") ??
    null;
  return { pass, of: rows.length, worst };
}

function headline(envs: ComparisonEnvelope[]): string {
  const head = "| runtime | model | accuracy | schema adherence | p50 | p95 | tokens/case | conf gap |";
  const sep = "|---|---|---|---|---|---|---|---|";
  const rows = envs.map((e) => {
    const m = e.metrics;
    const tokens = e.cases.map((c) => c.total_tokens).filter((n): n is number => n !== null);
    const avgTokens = tokens.length ? Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length) : null;
    const adherence =
      `${(m.schema_adherence * 100).toFixed(1)}%` + (m.unparseable > 0 ? ` (${m.unparseable} unparseable)` : "");
    return (
      `| **${e.runtime_label}** | \`${e.model ?? "n/a"}\` ` +
      `| ${m.passed}/${m.total} | ${adherence} ` +
      `| ${m.latency_ms.p50}ms | ${m.latency_ms.p95}ms ` +
      `| ${avgTokens ?? "n/a"} | ${fmtOrNa(m.calibration.gap)} |`
    );
  });
  return [head, sep, ...rows].join("\n");
}

/**
 * Cost, one row per runtime, each under its own basis — never differenced.
 * See refusal (2) at the top of this file.
 */
function costs(envs: ComparisonEnvelope[]): string {
  const lines = ["| runtime | $/ticket | $/mo @ 4,100/wk | basis |", "|---|---|---|---|"];
  for (const e of envs) {
    const c = e.metrics.cost;
    if (!c) {
      lines.push(`| **${e.runtime_label}** | n/a | n/a | no cost figure in this envelope |`);
      continue;
    }
    const flag = c.within_budget ? "" : " ⚠";
    lines.push(
      `| **${e.runtime_label}** | $${c.per_ticket.toFixed(5)} ` +
        `| $${c.monthly_projection.toFixed(0)}${flag} | ${c.basis} |`,
    );
  }
  const bases = new Set(envs.map((e) => e.metrics.cost?.basis).filter(Boolean));
  if (bases.size > 1) {
    lines.push("");
    lines.push(
      "> These figures are **not comparable as a subtraction**. They rest on different " +
        "bases — read each under its own, and do not put a delta between them on a slide.",
    );
  }
  return lines.join("\n");
}

function matrix(envs: ComparisonEnvelope[]): string {
  const ids = [...new Set(envs.flatMap((e) => e.cases.map((c) => c.id)))].sort();
  const head = `| case | ${envs.map((e) => e.runtime_label).join(" | ")} | what it tests |`;
  const sep = `|---|${envs.map(() => "---").join("|")}|---|`;
  const rows = ids.map((id) => {
    const cells = envs.map((e) => {
      const t = tally(e, id);
      if (t.of === 0) return "—";
      if (t.pass === t.of) return `· ${t.pass}/${t.of}`;
      const mark = t.worst?.outcome === "unparseable" ? "**SCHEMA**" : "**X**";
      return `${mark} ${t.pass}/${t.of}`;
    });
    const note = envs.flatMap((e) => e.cases).find((c) => c.id === id)?.notes ?? "";
    return `| ${id} | ${cells.join(" | ")} | ${note.slice(0, 64)} |`;
  });
  return [head, sep, ...rows].join("\n");
}

/** The honest holes. Both columns are expected to have entries. */
function holes(envs: ComparisonEnvelope[]): string {
  const out: string[] = [];
  for (const e of envs) {
    out.push(`**${e.runtime_label}** — what this runtime does not give you:`);
    out.push("");
    const entries = Object.entries(e.not_available);
    if (entries.length === 0) {
      out.push("- _(none declared — which is itself suspicious; see envelope.ts)_");
    }
    for (const [key, why] of entries) out.push(`- \`${key}\` — ${why}`);
    out.push("");
  }
  return out.join("\n");
}

function provenance(envs: ComparisonEnvelope[]): string {
  const lines = ["| runtime | recorded | sdk | node | repeats | samples | command |", "|---|---|---|---|---|---|---|"];
  for (const e of envs) {
    lines.push(
      `| ${e.runtime_label} | ${e.recorded_at} | \`${e.sdk.name}@${e.sdk.version}\` | ${e.node_version} ` +
        `| ${e.repeats} | ${e.metrics.latency_ms.samples} | \`${e.command}\` |`,
    );
  }
  return lines.join("\n");
}

function main(): void {
  const paths = process.argv.slice(2).filter((a) => a.endsWith(".json"));
  if (paths.length < 2) {
    console.error(
      "Pass at least two envelope paths.\n" +
        "  npm run eval:compare:report -- <claude-envelope.json> <cursor-envelope.json>",
    );
    process.exit(1);
  }

  const envs = load(paths);
  const caseCount = new Set(envs.flatMap((e) => e.cases.map((c) => c.id))).size;

  const md = [
    "# Same job, two primitives — measured",
    "",
    `Generated by \`npm run eval:compare:report\` on ${new Date().toISOString()}.`,
    "Every number below came from a checked-in command; nothing here was typed by hand.",
    "",
    "## Headline",
    "",
    headline(envs),
    "",
    `> **${caseCount} cases.** That is not a sample size that supports an accuracy ` +
      "percentage, and it is not meant to be — a Cursor agent run is a full agent " +
      "loop, so the shared set is deliberately tiny. Read the disagreement matrix " +
      "and the schema-adherence column. Those hold at n=3; the percentage does not.",
    "",
    "## Cost",
    "",
    costs(envs),
    "",
    "## Which cases each runtime loses",
    "",
    matrix(envs),
    "",
    "`·` passed every repeat · `X` wrong answer · `SCHEMA` the response never became a valid TriageResult",
    "",
    "## What each side cannot do",
    "",
    holes(envs),
    "## Provenance",
    "",
    provenance(envs),
    "",
  ].join("\n");

  console.log(`\n${md}`);

  const out = arg("out");
  if (out) {
    writeFileSync(out, md.endsWith("\n") ? md : `${md}\n`);
    console.log(`written: ${out}`);
  }
}

try {
  main();
} catch (err) {
  // The guards above are the point of this script; a reader who tripped one
  // needs the sentence, not a stack trace through the JSON parser.
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
