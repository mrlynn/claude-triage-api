# LLM findability for the course site

**Date:** 2026-08-29  
**Status:** Approved design  
**Audience:** Public web agents and crawlers hitting [triage.mlynn.dev](https://triage.mlynn.dev)  
**Out of scope (follow-ups):** In-repo `AGENTS.md` course map, MCP course resources, llms.txt directory registration

## Goal

Make the published course **findable and cheap to ingest** for LLMs and AI developer tools: a curated map, clean markdown mirrors of every published doc, and an optional full-corpus dump — without changing how humans read the Docusaurus site.

## Decisions

| Decision | Choice |
|---|---|
| Primary consumer | Public web agents on `triage.mlynn.dev` (not in-repo IDE agents first) |
| Depth | Index + per-page `.md` mirrors + `/llms-full.txt` |
| Implementation | Extend `website/scripts/sync-docs.mjs`; no new plugin |
| Mirror source | Repo-canonical markdown from `PAGES` (pre–Docusaurus transform) |
| Absolute URLs | Production host `https://triage.mlynn.dev`, overridable via `DOCS_SITE_URL` |
| Interactive pages | Not in corpus; link from **Optional** as human HTML URLs only |
| HTML discovery (v1) | Site-wide `rel=describedby` → `/llms.txt` only |
| Per-page `rel=alternate` | Deferred |

## Surfaces

| Artifact | URL | Role |
|---|---|---|
| Index | `/llms.txt` | Spec-shaped curated map; links to `.md` mirrors |
| Page mirrors | `/docs/<slug>.md` | Same path as HTML doc + `.md` ([llms.txt v2](https://llmstxt.org/)) |
| Full corpus | `/llms-full.txt` | Concatenated course markdown for one-shot ingest |
| Crawler hints | `/robots.txt` | Allow site; `Sitemap:` → Docusaurus sitemap |
| HTML hint | `link rel="describedby"` | Points at `/llms.txt` |

Files are written under `website/static/` so the Docusaurus build copies them unchanged.
Generated LLM artifacts (`llms.txt`, `llms-full.txt`, `robots.txt`, `docs/**/*.md`
mirrors) are produced by sync and should be gitignored the same way `website/docs/`
is — edit `PAGES` / the template in the script, never the emitted files.

## Corpus policy

**Primary (`llms.txt` sections, not Optional):**

- Start: Overview, Scenario, Setup, Concept map  
- Labs: Labs 0–10  
- Reference: Glossary, Architecture, Next steps  

**Optional (agents may skip when short on context):**

- Solutions (spoilers)  
- Instructor guide  
- Comparison  
- GitHub repo, Northwind storefront, playgrounds, assessment, talk (HTML only)

**Omit:** Nothing else in `PAGES` unless explicitly marked `llmsSection: "omit"`.

## Sync pipeline

Extend the end of `sync-docs.mjs` (same run as today’s docs sync).

### Metadata on `PAGES`

Each included entry gains:

| Field | Purpose |
|---|---|
| `llmsSection` | `Start` · `Labs` · `Reference` · `Optional` · `omit` |
| `llmsNote` | One-line description after the link in `llms.txt` |
| `title` | Required for every non-`omit` page (some entries already have it) |

### Outputs

1. **`static/docs/<out>.md`**  
   Source markdown body plus a short HTML-comment preamble:

   ```html
   <!-- canonical: https://triage.mlynn.dev/docs/<out> -->
   <!-- source: curriculum/... -->
   ```

   Do **not** run the Docusaurus link rewriter on mirrors. Repo-relative links stay as in the curriculum; agents that need source follow GitHub via Optional / Overview.

2. **`static/llms.txt`**  
   Template filled from `PAGES`:

   - H1: project name  
   - Blockquote: one-line identity (course + reference API, Node ≥ 20, course + shop URLs)  
   - Short prose: prefer `.md` links; HTML has nav chrome; solutions are spoilers  
   - H2 sections from `llmsSection`; **Optional** last  
   - Links use absolute `.md` URLs (and absolute HTML for non-mirrored Optional entries)

3. **`static/llms-full.txt`**  
   For each non-`omit` page in order Start → Labs → Reference → Optional:

   ```markdown
   # <Title>
   Source: <canonical .md URL>

   <body>

   ---
   ```

   No truncation in v1. Revisit only if the file grows past a few hundred KB.

4. **`static/robots.txt`**  
   Allow `/`. Include `Sitemap: <SITE_URL>/sitemap.xml` (Docusaurus classic default).
   Remain open to AI crawlers; no UA blocklist in v1.

### HTML head (v1)

In `docusaurus.config.ts` `headTags`, add a site-wide:

```html
<link rel="describedby" href="/llms.txt" />
```

(Use `BASE_URL`-aware href if the site is ever served under a subpath.)

Per-doc `rel="alternate" type="text/markdown"` is nicer but needs a theme swizzle; defer.

## What we are not doing in v1

- `docusaurus-plugin-llms` or other third-party generators  
- Pointing `llms.txt` at GitHub raw URLs as the primary surface  
- Course-as-MCP-resources  
- In-repo agent onboarding (`AGENTS.md` map) — separate track when we optimize for Cursor/Claude Code clones  
- Submitting to public llms.txt directories (manual, post-ship)  
- Mirroring React-only pages as synthetic markdown

## Verification

After sync + build:

1. `build/llms.txt`, `build/llms-full.txt`, and every included `build/docs/<slug>.md` exist.  
2. Spot-check glossary and lab-1 mirrors match source length (preamble aside).  
3. `llms.txt` links resolve (absolute, 200).  
4. After deploy: curl production `/llms.txt`, one `.md` mirror, and `/llms-full.txt`.

## Success criteria

An agent given only `https://triage.mlynn.dev/llms.txt` can find setup, a specific lab, and the glossary without scraping HTML chrome — and can pull the full course in one request via `/llms-full.txt` when it wants the whole corpus.
