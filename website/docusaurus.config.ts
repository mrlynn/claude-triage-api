import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";
import { themes as prismThemes } from "prism-react-renderer";
import { readFileSync } from "node:fs";
import { STOREFRONT_URL, storefront } from "./src/urls";
import remarkQuiz from "./plugins/remark-quiz.mjs";
import remarkTry from "./plugins/remark-try.mjs";
import remarkReceipt from "./plugins/remark-receipt.mjs";
import remarkPath from "./plugins/remark-path.mjs";

const GITHUB_ORG = process.env.DOCS_GITHUB_ORG ?? "mrlynn";
const GITHUB_REPO = process.env.DOCS_GITHUB_REPO ?? "claude-triage-api";
const GITHUB_REPO_URL = `https://github.com/${GITHUB_ORG}/${GITHUB_REPO}`;
const GITHUB_DISCUSSIONS_URL = `${GITHUB_REPO_URL}/discussions`;

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

const PUBLIC_SITE_URL = new URL(BASE_URL, `${SITE_URL}/`).toString();

// Machine-readable context for search engines and AI assistants. This
// describes the course as a whole; individual pages still own their titles,
// descriptions, canonical URLs, and social images.
const COURSE_SCHEMA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${PUBLIC_SITE_URL}#website`,
      url: PUBLIC_SITE_URL,
      name: "Claude Triage API",
      description: "A hands-on course for developers building with the Claude API.",
      inLanguage: "en",
    },
    {
      "@type": "Course",
      "@id": `${PUBLIC_SITE_URL}#course`,
      name: "Claude API hands-on course",
      description:
        "Learn the Claude API by building an auditable customer-support triage service with structured outputs, tool use, streaming, prompt caching, and evals.",
      url: PUBLIC_SITE_URL,
      inLanguage: "en",
      educationalLevel: "Intermediate",
      timeRequired: "PT4H",
      isAccessibleForFree: true,
      about: ["Claude API", "LLM application development", "TypeScript"],
      hasCourseInstance: { "@type": "CourseInstance", courseMode: "online" },
      provider: {
        "@type": "Organization",
        name: "Claude Triage API",
        url: PUBLIC_SITE_URL,
        sameAs: [GITHUB_REPO_URL],
      },
    },
  ],
};

/**
 * Docs content is GENERATED into ./docs by scripts/sync-docs.mjs from the
 * markdown in the repo root. Edit the repo markdown, not ./docs.
 */
const config: Config = {
  title: "Claude Triage API",
  tagline: "A teaching-grade reference API for the Claude API",
  // Northwind mark — same asset as /brand. SVG for crisp tabs; ico kept as
  // a same-mark fallback for older agents that still request /img/favicon.ico.
  favicon: "img/brand/northwind-mark.svg",

  url: SITE_URL,
  baseUrl: BASE_URL,
  organizationName: GITHUB_ORG,
  projectName: GITHUB_REPO,
  headTags: [
    {
      tagName: "script",
      attributes: { type: "application/ld+json" },
      innerHTML: JSON.stringify(COURSE_SCHEMA),
    },
    {
      tagName: "meta",
      attributes: {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
    },
  ],

  // A broken link means a lab sends a learner to a 404 mid-exercise, so fail
  // the build rather than ship it.
  onBrokenLinks: "throw",

  markdown: {
    // Treat .md as CommonMark rather than MDX. The lab markdown contains
    // things like <customer_message> and bare braces that MDX would try to
    // parse as JSX and reject.
    format: "detect",
    mermaid: true,
    hooks: { onBrokenMarkdownLinks: "throw" },
  },

  themes: [
    "@docusaurus/theme-mermaid",
    [
      // Offline search. Algolia DocSearch needs an application to a crawler
      // service and a live public URL; this builds a lunr index at build time
      // and ships it with the static site, so it works on Vercel, on GitHub
      // Pages, and on a laptop with no network.
      "@easyops-cn/docusaurus-search-local",
      {
        // Docs are only half the site. /start, /mission, /assessment and
        // /playground are React pages, and two of them just moved behind a
        // navbar dropdown — search is now how people find them.
        indexPages: true,
        indexBlog: false,
        docsRouteBasePath: "docs",
        hashed: true,
        highlightSearchTermsOnTargetPage: true,
        searchResultLimits: 8,
        searchResultContextMaxLength: 60,
      },
    ],
  ],

  i18n: { defaultLocale: "en", locales: ["en"] },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          remarkPlugins: [remarkQuiz, remarkTry, remarkReceipt, remarkPath],
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
    // Every page shared from here rendered the stock Docusaurus card, which
    // told a reader in a feed that this was somebody's generic docs site.
    // Generated by `storefront/scripts/og-cards.mjs` alongside the shop's, so
    // the two surfaces read as one thing when both land in the same feed.
    image: "img/og-labs.png",
    colorMode: { defaultMode: "dark", respectPrefersColorScheme: true },
    navbar: {
      title: "Claude Triage API",
      // Labs run long; give the reader the vertical space back.
      hideOnScroll: true,
      // Eleven flat items outgrew the bar and stopped being scannable. The
      // three things a reader clicks mid-course — Labs, Playground,
      // Assessment — stay one click away; the read-once pages move into
      // dropdowns, where the docs sidebar already carries them anyway.
      items: [
        {
          type: "dropdown",
          position: "left",
          label: "Start here",
          items: [
            { type: "doc", docId: "intro", label: "Overview" },
            { type: "doc", docId: "scenario", label: "Scenario" },
            { type: "doc", docId: "setup", label: "Setup" },
            { to: "/start", label: "Start from zero" },
            { to: "/docs/guides", label: "Practical guides" },
          ],
        },
        // Not `type: docSidebar` — that resolves to the sidebar's first doc,
        // which is intro, the same page as "Start here > Overview". The labs
        // category has its own generated index; point at that instead.
        { to: "/docs/labs", position: "left", label: "Labs" },
        { to: "/playground", position: "left", label: "Playground" },
        {
          type: "dropdown",
          position: "left",
          label: "Reference",
          items: [
            { type: "doc", docId: "concept-map", label: "Concepts" },
            { type: "doc", docId: "glossary", label: "Glossary" },
            { type: "doc", docId: "architecture", label: "Architecture" },
            { to: "/mission", label: "Mission" },
          ],
        },
        { to: "/assessment", position: "left", label: "Assessment" },
        // Explicit, so search sits ahead of the two outbound links rather
        // than auto-appending past the colour-mode toggle at the far edge.
        { type: "search", position: "right" },
        {
          href: STOREFRONT_URL,
          position: "right",
          label: "Northwind store",
        },
        {
          href: GITHUB_REPO_URL,
          label: "GitHub",
          position: "right",
        },
        {
          href: GITHUB_DISCUSSIONS_URL,
          label: "Discuss",
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
            { label: "The inbound queue", to: "/playground/queue" },
            { label: "Ops dashboard", href: storefront("/ops") },
            { label: "Visit the storefront", href: STOREFRONT_URL },
            { label: "Setup", to: "/docs/setup" },
            { label: "Concept map", to: "/docs/concept-map" },
            { label: "Glossary", to: "/docs/glossary" },
            { label: "Lab 1", to: "/docs/labs/lab-1-first-call" },
            { label: "Assessment", to: "/assessment" },
            { label: "Playground", to: "/playground" },
            { label: "Northwind mission", to: "/mission" },
            { label: "Why this course exists", to: "/why-this-course-exists" },
          ],
        },
        {
          title: "Teaching",
          items: [
            { label: "Instructor guide", to: "/docs/instructor-guide" },
            { label: "Architecture", to: "/docs/architecture" },
            { label: "Ask a question or share your build", href: GITHUB_DISCUSSIONS_URL },
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
      // github is near-neutral and sits fine on Bone. dracula was the default
      // and is purple/pink — on a pine-and-spruce palette it read as a
      // different site pasted into the middle of the page. oceanicNext is
      // muted and slightly desaturated, and custom.css puts both on the site's
      // own surface colour so a page never carries two competing grounds.
      theme: prismThemes.github,
      darkTheme: prismThemes.oceanicNext,
      additionalLanguages: ["bash", "json", "typescript"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
