/**
 * The drift guard. `npm run check:snippets`
 *
 * THE PROBLEM IT SOLVES: this course quotes its own source code in prose, and
 * prose does not get refactored. Every phase of work on `src/` so far has
 * required a manual sweep through `curriculum/` looking for snippets that had
 * quietly stopped being true — a signature that gained an argument, a function
 * that moved file. Manual sweeps work until somebody is in a hurry, and a lab
 * that shows code the repo no longer contains is worse than one that shows no
 * code at all, because the reader has no reason to doubt it.
 *
 * THE CONTRACT: any ```ts fence in curriculum/ or docs/ whose FIRST LINE is a
 * comment naming a repo file is checked. The body must appear in that file,
 * ignoring indentation and blank lines.
 *
 *     ```ts
 *     // src/lib/untrusted.ts
 *     export function wrapUntrusted(text: string, tag = "customer_message"): string {
 *       const escaped = text.replace(/</g, "&lt;");
 *     ```
 *
 * Fences without that marker are ignored — plenty of snippets are illustrative
 * pseudocode, "what NOT to do" examples, or shell commands, and demanding that
 * every one of them exist verbatim in the source would make the checker
 * something people route around. Opt-in keeps it credible.
 *
 * MATCHING IS AN ORDERED SUBSEQUENCE, not a substring, and that choice took a
 * failed run to get right. Lab prose legitimately condenses: it dedents a
 * snippet out of its enclosing function, and it drops the lines that are not
 * the point — Lab 3 shows the usage accumulation inside the runner loop
 * without the `pause_turn` branch sitting between them. A substring check
 * fails all of that, which would make the checker something people route
 * around rather than fix.
 *
 * So: every line of the snippet must appear in the source, in order, ignoring
 * indentation. That still catches the failure mode this exists for — a
 * signature that gained an argument, a call that moved, a name that changed —
 * because those lines stop matching. It does not catch a snippet that omits
 * something important, and it is not trying to.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEARCH_DIRS = ["curriculum", "docs"];

interface Snippet {
  docFile: string;
  line: number;
  sourceFile: string;
  body: string;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

/** Significant lines only: no indentation, no blanks. */
function significantLines(code: string): string[] {
  return code
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * True when every snippet line appears in the source, in order.
 *
 * Returns the first line that could not be matched, so the error message
 * points at the drift rather than dumping the whole snippet and leaving the
 * reader to diff it by eye.
 */
function findDrift(sourceLines: string[], snippetLines: string[]): string | null {
  let cursor = 0;
  for (const line of snippetLines) {
    const found = sourceLines.indexOf(line, cursor);
    if (found === -1) return line;
    cursor = found + 1;
  }
  return null;
}

function collectSnippets(): Snippet[] {
  const snippets: Snippet[] = [];

  for (const dir of SEARCH_DIRS) {
    for (const docFile of walk(join(root, dir))) {
      const lines = readFileSync(docFile, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (!/^```ts\s*$/.test(lines[i]!)) continue;

        const close = lines.indexOf("```", i + 1);
        if (close === -1) break;

        const body = lines.slice(i + 1, close);
        const marker = body[0]?.trim().match(/^\/\/\s*((?:src|evals|scripts|storefront)\/\S+\.ts)$/);
        if (marker) {
          snippets.push({
            docFile: relative(root, docFile),
            line: i + 1,
            sourceFile: marker[1]!,
            body: body.slice(1).join("\n"),
          });
        }
        i = close;
      }
    }
  }

  return snippets;
}

function main(): void {
  const snippets = collectSnippets();
  const failures: string[] = [];

  for (const s of snippets) {
    let source: string;
    try {
      source = readFileSync(join(root, s.sourceFile), "utf8");
    } catch {
      failures.push(
        `${s.docFile}:${s.line} quotes ${s.sourceFile}, which does not exist.`,
      );
      continue;
    }

    const drifted = findDrift(significantLines(source), significantLines(s.body));
    if (drifted !== null) {
      failures.push(
        `${s.docFile}:${s.line} quotes ${s.sourceFile}, but this line is not in it ` +
          `(or is out of order):\n      ${drifted}`,
      );
    }
  }

  console.log(
    `\nchecked ${snippets.length} marked snippet${snippets.length === 1 ? "" : "s"} ` +
      `across ${SEARCH_DIRS.join(", ")}\n`,
  );

  if (failures.length > 0) {
    console.error(`${failures.length} snippet(s) have drifted from the source:\n`);
    for (const f of failures) console.error(`  - ${f}\n`);
    console.error(
      "Fix the prose, not the checker. A lab that shows code the repo does not\n" +
        "contain is worse than one that shows no code, because the reader has no\n" +
        "reason to doubt it.\n",
    );
    process.exit(1);
  }

  console.log("All marked snippets match their source.\n");
}

main();
