/**
 * Sync repo markdown into the Docusaurus site.
 *
 * WHY A SYNC STEP instead of pointing Docusaurus straight at ../curriculum:
 * the lab markdown is also read directly on GitHub, where relative links like
 * (../../src/routes/triage.ts) are the whole point. Docusaurus cannot serve
 * those. So this script is the one place that knows how to turn a repo path
 * into either a doc route (for markdown we publish) or a GitHub blob URL (for
 * source files), and the markdown itself stays canonical and portable.
 *
 * Runs automatically before start and build. Never edit website/docs by hand.
 * It is generated, and it is gitignored.
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  readdirSync,
  copyFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const websiteDir = resolve(here, "..");
const repoRoot = resolve(websiteDir, "..");
const outDir = join(websiteDir, "docs");

// Kept in sync with docusaurus.config.ts, which reads the same two env vars.
const GITHUB_ORG = process.env.DOCS_GITHUB_ORG ?? "mrlynn";
const GITHUB_REPO = process.env.DOCS_GITHUB_REPO ?? "claude-triage-api";
const GITHUB_REF = process.env.DOCS_GITHUB_REF ?? "main";

const GITHUB_BASE =
  process.env.DOCS_GITHUB_BASE ??
  `https://github.com/${GITHUB_ORG}/${GITHUB_REPO}/blob/${GITHUB_REF}`;

const GITHUB_TREE_BASE = GITHUB_BASE.replace("/blob/", "/tree/");

/** Subdirectories of assets/ whose images are served by the site. */
const IMAGE_DIRS = ["brand", "readme", "talk"];
const IMAGE_EXT = /\.(svg|png|jpe?g)$/i;

/**
 * source:   path relative to repo root
 * out:      path relative to website/docs, no extension
 * position: sidebar_position within its folder
 */
const PAGES = [
  { source: "README.md", out: "intro", position: 1, title: "Overview" },
  { source: "curriculum/scenario.md", out: "scenario", position: 2 },
  { source: "curriculum/setup.md", out: "setup", position: 3 },
  { source: "curriculum/00-concept-map.md", out: "concept-map", position: 4 },
  { source: "curriculum/glossary.md", out: "glossary", position: 5 },
  { source: "docs/comparison.md", out: "comparison", position: 6, title: "Claude vs Cursor" },
  { source: "curriculum/next-steps.md", out: "next-steps", position: 7, title: "Where this goes next" },
  { source: "curriculum/labs/lab-0-scoreboard.md", out: "labs/lab-0-scoreboard", position: 0 },
  { source: "curriculum/labs/lab-1-first-call.md", out: "labs/lab-1-first-call", position: 1 },
  { source: "curriculum/labs/lab-2-structured-outputs.md", out: "labs/lab-2-structured-outputs", position: 2 },
  { source: "curriculum/labs/lab-3-tool-use.md", out: "labs/lab-3-tool-use", position: 3 },
  { source: "curriculum/labs/lab-4-streaming.md", out: "labs/lab-4-streaming", position: 4 },
  { source: "curriculum/labs/lab-5-prompt-caching.md", out: "labs/lab-5-prompt-caching", position: 5 },
  { source: "curriculum/labs/lab-6-evals.md", out: "labs/lab-6-evals", position: 6 },
  { source: "curriculum/labs/lab-7-choosing-a-model.md", out: "labs/lab-7-choosing-a-model", position: 7 },
  { source: "curriculum/labs/lab-8-trust-boundary.md", out: "labs/lab-8-trust-boundary", position: 8 },
  { source: "curriculum/labs/lab-9-shipping-it.md", out: "labs/lab-9-shipping-it", position: 9 },
  { source: "curriculum/labs/lab-10-ask-northwind.md", out: "labs/lab-10-ask-northwind", position: 10 },
  { source: "curriculum/solutions/lab-0.md", out: "solutions/lab-0", position: 0, title: "Lab 0 answers" },
  { source: "curriculum/solutions/lab-1.md", out: "solutions/lab-1", position: 1, title: "Lab 1 answers" },
  { source: "curriculum/solutions/lab-2.md", out: "solutions/lab-2", position: 2, title: "Lab 2 answers" },
  { source: "curriculum/solutions/lab-3.md", out: "solutions/lab-3", position: 3, title: "Lab 3 answers" },
  { source: "curriculum/solutions/lab-4.md", out: "solutions/lab-4", position: 4, title: "Lab 4 answers" },
  { source: "curriculum/solutions/lab-5.md", out: "solutions/lab-5", position: 5, title: "Lab 5 answers" },
  { source: "curriculum/solutions/lab-6.md", out: "solutions/lab-6", position: 6, title: "Lab 6 answers" },
  { source: "curriculum/solutions/lab-7.md", out: "solutions/lab-7", position: 7, title: "Lab 7 answers" },
  { source: "curriculum/solutions/lab-8.md", out: "solutions/lab-8", position: 8, title: "Lab 8 answers" },
  { source: "curriculum/solutions/lab-9.md", out: "solutions/lab-9", position: 9, title: "Lab 9 answers" },
  { source: "curriculum/solutions/lab-10.md", out: "solutions/lab-10", position: 10, title: "Lab 10 answers" },
  { source: "python/labs/deltas.md", out: "python-deltas", position: 6, title: "The Python deltas" },
  { source: "docs/architecture.md", out: "architecture", position: 5 },
  { source: "curriculum/01-instructor-guide.md", out: "instructor-guide", position: 6 },
  { source: "curriculum/assessment.md", out: "assessment", position: 7 },
  { source: "curriculum/02-run-of-show.md", out: "run-of-show", position: 8 },
  { source: "docs/facilitator/keys.md", out: "facilitator-keys", position: 9, title: "Keys and costs" },
];

/** repo-relative source path -> site route */
const routeBySource = new Map(PAGES.map((p) => [p.source, `/docs/${p.out}`]));

// First useful mention per concept gets a glossary link. This is intentionally
// conservative: a glossary should be a handrail for a newcomer, not turn
// every paragraph into a chain of blue links. Fenced/inline code, headings,
// and links already authored in the curriculum are parked before this runs.
const GLOSSARY_TERMS = [
  ["Messages API", "messages-api"],
  ["System prompt", "system-prompt"],
  ["prompt caching", "prompt-caching"],
  ["structured outputs", "structured-outputs--schema"],
  ["content blocks?", "content-block"],
  ["tool trace", "tool-trace"],
  ["tool use", "tool-use"],
  ["prompt injection", "prompt-injection--untrusted-input"],
  ["untrusted input", "prompt-injection--untrusted-input"],
  ["rate limit", "rate-limit"],
  ["context window", "context-window"],
  ["streaming", "streaming--sse"],
  ["SSE", "streaming--sse"],
  ["guardrails?", "guardrail"],
  ["usage", "usage-and-cost"],
  ["schemas?", "structured-outputs--schema"],
  ["tokens?", "token"],
  ["models?", "model"],
  ["SDK", "sdk"],
  ["API", "api"],
  ["Anthropic", "anthropic"],
  ["Claude", "claude"],
  ["evals?", "evaluation--eval"],
];

/**
 * Regions of a line that must never be rewritten: existing links and images,
 * inline code, HTML tags, and bare URLs.
 *
 * This exists because the linker used to match anywhere on the line, which
 * quietly rewrote the INSIDE of a URL — a repo link containing the words
 * "claude" and "api" came out as
 * `https://github.com/mrlynn/[claude](/docs/glossary#claude)-triage-…`,
 * a dead link that still looks plausible in a diff. Existing pages escaped it
 * only by luck: the first occurrence of each term happened to fall in visible
 * text rather than in a href.
 */
const PROTECTED = /(!?\[[^\]]*\]\([^)]*\)|`[^`]*`|<[^>]+>|https?:\/\/\S+)/g;

function addGlossaryLinks(body, page) {
  if (page.source === "curriculum/glossary.md") return body;
  const linked = new Set();
  return body.split("\n").map((line) => {
    if (/^\s*(#|<!--)/.test(line)) return line;

    // Split into alternating plain / protected segments. String.split with a
    // capturing group keeps the delimiters, so odd indexes are the parts to
    // leave alone.
    const parts = line.split(PROTECTED);

    for (const [term, anchor] of GLOSSARY_TERMS) {
      if (linked.has(anchor)) continue;
      const pattern = new RegExp(`\\b(${term})\\b`, "i");
      const at = parts.findIndex((part, i) => i % 2 === 0 && pattern.test(part));
      if (at === -1) continue;
      parts[at] = parts[at].replace(
        pattern,
        (match) => `[${match}](/docs/glossary#${anchor})`,
      );
      linked.add(anchor);
    }
    return parts.join("");
  }).join("\n");
}

/** Wrap each ## heading + following prose in a card for the docs glossary grid. */
function wrapGlossaryCards(body) {
  const parts = body.split(/^## /m);
  if (parts.length < 2) return body;
  const intro = parts[0].trimEnd();
  const cards = parts.slice(1).map((chunk) => {
    const nl = chunk.indexOf("\n");
    const title = (nl === -1 ? chunk : chunk.slice(0, nl)).trim();
    const rest = (nl === -1 ? "" : chunk.slice(nl + 1)).trim();
    return `<div class="nw-glossary-card">\n\n## ${title}\n\n${rest}\n\n</div>`;
  });
  return `${intro}\n\n<div class="nw-glossary-grid">\n\n${cards.join("\n\n")}\n\n</div>\n`;
}

/** Turn a link found inside `sourceFile` into a site-appropriate href. */
function rewriteLink(href, sourceFile) {
  const hashAt = href.indexOf("#");
  const pathPart = hashAt === -1 ? href : href.slice(0, hashAt);
  const suffix = hashAt === -1 ? "" : href.slice(hashAt);

  // Pure anchor link, leave it alone.
  if (!pathPart) return href;

  // Resolve against the source file's directory, then make it repo-relative.
  const abs = resolve(repoRoot, dirname(sourceFile), pathPart);
  const repoPath = relative(repoRoot, abs);

  // Escaped the repo somehow. Leave it untouched.
  if (repoPath.startsWith("..")) return href;

  // A page we publish, so link internally.
  const route = routeBySource.get(repoPath);
  if (route) return route + suffix;

  // Images are copied into static/, so serve them locally instead of sending
  // an <img> at a GitHub HTML page — which renders as HTML, not as a picture.
  for (const dir of IMAGE_DIRS) {
    if (repoPath.startsWith(`assets/${dir}/`) && IMAGE_EXT.test(repoPath)) {
      return `/img/${dir}/${repoPath.split("/").pop()}${suffix}`;
    }
  }

  // Anything else in the repo: source, fixtures, config. Send it to GitHub.
  // Directories need tree/ rather than blob/, so switch on whether the last
  // segment looks like a filename.
  const isFile = /\.[a-z0-9]+$/i.test(repoPath);
  const base = isFile ? GITHUB_BASE : GITHUB_TREE_BASE;
  return `${base}/${repoPath}${suffix}`;
}

function transform(page) {
  const srcPath = join(repoRoot, page.source);
  if (!existsSync(srcPath)) throw new Error(`Missing source file: ${page.source}`);

  let body = readFileSync(srcPath, "utf8");

  // Lift the H1 into frontmatter, then drop it so the heading is not rendered
  // twice.
  const h1 = body.match(/^#\s+(.+)$/m);
  const title = page.title ?? (h1 ? h1[1].trim() : page.out);
  if (h1) body = body.replace(`${h1[0]}\n`, "");

  // Park fenced code blocks so link rewriting cannot touch shell snippets that
  // happen to contain brackets and parentheses.
  const fences = [];
  body = body.replace(/```[\s\S]*?```/g, (m) => {
    fences.push(m);
    return `@@FENCE${fences.length - 1}@@`;
  });

  const links = [];
  body = body.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (whole, text, href) => {
    const rewritten = /^(https?:|mailto:|\/)/.test(href)
      ? whole
      : `[${text}](${rewriteLink(href, page.source)})`;
    links.push(rewritten);
    return `@@LINK${links.length - 1}@@`;
  });

  const inlineCode = [];
  body = body.replace(/`[^`]+`/g, (m) => {
    inlineCode.push(m);
    return `@@INLINE${inlineCode.length - 1}@@`;
  });

  body = addGlossaryLinks(body, page);

  body = body.replace(/@@LINK(\d+)@@/g, (_, i) => links[Number(i)]);
  body = body.replace(/@@INLINE(\d+)@@/g, (_, i) => inlineCode[Number(i)]);
  body = body.replace(/@@FENCE(\d+)@@/g, (_, i) => fences[Number(i)]);

  // Glossary: wrap each ## term + body in a card so the site can grid them
  // without splitting heading and definition across CSS grid cells. Source
  // markdown on GitHub stays unwrapped (this runs only on the generated copy).
  if (page.out === "glossary") {
    body = wrapGlossaryCards(body);
  }

  const frontmatter = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `sidebar_position: ${page.position}`,
    "---",
    "",
    `<!-- GENERATED. Edit ${page.source} in the repo, then re-run sync-docs. -->`,
    "",
  ].join("\n");

  return frontmatter + body;
}

/**
 * Images that markdown in the repo points at.
 *
 * They are canonical under assets/ so they also render on GitHub, where the
 * README is read as often as the site is. Copying them into static/ lets the
 * same relative path work in both places — see rewriteLink above.
 *
 *   brand/   the mark, in the scenario page and the storefront
 *   readme/  the banner and gallery, generated by storefront/scripts/readme-art.mjs
 *   talk/    course-deck stills (shop, queue, form, bottle) reused in labs
 */
for (const dir of IMAGE_DIRS) {
  const src = join(repoRoot, "assets", dir);
  if (!existsSync(src)) continue;
  const out = join(websiteDir, "static", "img", dir);
  mkdirSync(out, { recursive: true });
  for (const file of readdirSync(src)) {
    if (IMAGE_EXT.test(file)) copyFileSync(join(src, file), join(out, file));
  }
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const page of PAGES) {
  const target = join(outDir, `${page.out}.md`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, transform(page));
}

// Map generated doc path -> canonical repo source, so the site's "Edit this
// page" link points at the file you can actually edit rather than at the
// generated copy, which is gitignored and 404s on GitHub.
writeFileSync(
  join(websiteDir, "docs-manifest.json"),
  `${JSON.stringify(
    Object.fromEntries(PAGES.map((p) => [`${p.out}.md`, p.source])),
    null,
    2,
  )}\n`,
);

console.log(`synced ${PAGES.length} pages into website/docs`);
