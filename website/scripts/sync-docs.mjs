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
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
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
  { source: "curriculum/labs/lab-1-first-call.md", out: "labs/lab-1-first-call", position: 1 },
  { source: "curriculum/labs/lab-2-structured-outputs.md", out: "labs/lab-2-structured-outputs", position: 2 },
  { source: "curriculum/labs/lab-3-tool-use.md", out: "labs/lab-3-tool-use", position: 3 },
  { source: "curriculum/labs/lab-4-streaming.md", out: "labs/lab-4-streaming", position: 4 },
  { source: "curriculum/labs/lab-5-prompt-caching.md", out: "labs/lab-5-prompt-caching", position: 5 },
  { source: "curriculum/labs/lab-6-evals.md", out: "labs/lab-6-evals", position: 6 },
  { source: "curriculum/solutions/lab-1.md", out: "solutions/lab-1", position: 1, title: "Lab 1 answers" },
  { source: "curriculum/solutions/lab-2.md", out: "solutions/lab-2", position: 2, title: "Lab 2 answers" },
  { source: "curriculum/solutions/lab-3.md", out: "solutions/lab-3", position: 3, title: "Lab 3 answers" },
  { source: "curriculum/solutions/lab-4.md", out: "solutions/lab-4", position: 4, title: "Lab 4 answers" },
  { source: "curriculum/solutions/lab-5.md", out: "solutions/lab-5", position: 5, title: "Lab 5 answers" },
  { source: "curriculum/solutions/lab-6.md", out: "solutions/lab-6", position: 6, title: "Lab 6 answers" },
  { source: "docs/architecture.md", out: "architecture", position: 5 },
  { source: "curriculum/01-instructor-guide.md", out: "instructor-guide", position: 6 },
  { source: "curriculum/assessment.md", out: "assessment", position: 7 },
];

/** repo-relative source path -> site route */
const routeBySource = new Map(PAGES.map((p) => [p.source, `/docs/${p.out}`]));

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

  body = body.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (whole, text, href) => {
    if (/^(https?:|mailto:|\/)/.test(href)) return whole;
    return `[${text}](${rewriteLink(href, page.source)})`;
  });

  body = body.replace(/@@FENCE(\d+)@@/g, (_, i) => fences[Number(i)]);

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
