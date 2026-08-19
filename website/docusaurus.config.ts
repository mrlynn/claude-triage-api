import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";
import { themes as prismThemes } from "prism-react-renderer";
import { readFileSync } from "node:fs";

const GITHUB_ORG = process.env.DOCS_GITHUB_ORG ?? "mrlynn";
const GITHUB_REPO = process.env.DOCS_GITHUB_REPO ?? "claude-triage-api";
const GITHUB_REPO_URL = `https://github.com/${GITHUB_ORG}/${GITHUB_REPO}`;

/**
 * Deploy target decides the URL shape, and getting it wrong is the classic
 * "every asset 404s in production" bug.
 *
 *   Vercel      served at a domain root  -> baseUrl "/"
 *   GitHub Pages served at /<repo>/      -> baseUrl "/<repo>/"
 *
 * Vercel sets VERCEL=1 on every build, so the right values are picked
 * automatically and neither target needs a hand-edited config. Override
 * either one explicitly with DOCS_SITE_URL / DOCS_BASE_URL.
 */
/**
 * docs/ is generated, so a naive editUrl sends people to a path that does not
 * exist in the repo. sync-docs.mjs writes this manifest mapping each generated
 * page back to its canonical source.
 */
let DOC_SOURCES: Record<string, string> = {};
try {
  DOC_SOURCES = JSON.parse(readFileSync("./docs-manifest.json", "utf8"));
} catch {
  // Sync has not run yet. Edit links fall back to the repo root.
}

const ON_VERCEL = process.env.VERCEL === "1";

const VERCEL_URL =
  process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

const SITE_URL =
  process.env.DOCS_SITE_URL ??
  (ON_VERCEL && VERCEL_URL
    ? `https://${VERCEL_URL}`
    : ON_VERCEL
      ? "https://example.vercel.app"
      : `https://${GITHUB_ORG}.github.io`);

const BASE_URL =
  process.env.DOCS_BASE_URL ?? (ON_VERCEL ? "/" : `/${GITHUB_REPO}/`);

/**
 * Docs content is GENERATED into ./docs by scripts/sync-docs.mjs from the
 * markdown in the repo root. Edit the repo markdown, not ./docs.
 */
const config: Config = {
  title: "Claude Triage API",
  tagline: "A teaching-grade reference API for the Claude API",
  favicon: "img/favicon.ico",

  url: SITE_URL,
  baseUrl: BASE_URL,
  organizationName: GITHUB_ORG,
  projectName: GITHUB_REPO,

  // A broken link means a lab sends a learner to a 404 mid-exercise, so fail
  // the build rather than ship it.
  onBrokenLinks: "throw",

  markdown: {
    // Treat .md as CommonMark rather than MDX. The lab markdown contains
    // things like <customer_message> and bare braces that MDX would try to
    // parse as JSX and reject.
    format: "detect",
    hooks: { onBrokenMarkdownLinks: "throw" },
  },

  i18n: { defaultLocale: "en", locales: ["en"] },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          routeBasePath: "docs",
          editUrl: ({ docPath }) => {
            const source = DOC_SOURCES[docPath];
            return source
              ? `${GITHUB_REPO_URL}/edit/main/${source}`
              : GITHUB_REPO_URL;
          },
        },
        blog: false,
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: { defaultMode: "dark", respectPrefersColorScheme: true },
    navbar: {
      title: "Claude Triage API",
      items: [
        { type: "doc", docId: "intro", position: "left", label: "Overview" },
        { type: "doc", docId: "scenario", position: "left", label: "Scenario" },
        { type: "doc", docId: "setup", position: "left", label: "Setup" },
        { type: "doc", docId: "concept-map", position: "left", label: "Concepts" },
        {
          type: "docSidebar",
          sidebarId: "courseSidebar",
          position: "left",
          label: "Labs",
        },
        { type: "doc", docId: "architecture", position: "left", label: "Architecture" },
        { to: "/playground", position: "left", label: "Playground" },
        {
          href: GITHUB_REPO_URL,
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Course",
          items: [
            { label: "The scenario", to: "/docs/scenario" },
            { label: "Northwind brand", to: "/brand" },
            { label: "Setup", to: "/docs/setup" },
            { label: "Concept map", to: "/docs/concept-map" },
            { label: "Lab 1", to: "/docs/labs/lab-1-first-call" },
            { label: "Assessment", to: "/docs/assessment" },
            { label: "Playground", to: "/playground" },
          ],
        },
        {
          title: "Teaching",
          items: [
            { label: "Instructor guide", to: "/docs/instructor-guide" },
            { label: "Architecture", to: "/docs/architecture" },
          ],
        },
        {
          title: "Reference",
          items: [
            { label: "Claude API docs", href: "https://docs.claude.com" },
            { label: "Console", href: "https://console.anthropic.com" },
          ],
        },
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "json", "typescript"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
