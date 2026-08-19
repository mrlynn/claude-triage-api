# Documentation site

Docusaurus site that publishes the labs, concept map, architecture notes, and
instructor material as a browsable course.

```bash
npm install && npm start
```

Opens on http://localhost:3000/claude-triage-api/.

## How content gets here

**Nothing in `docs/` is written by hand. It is generated and gitignored.**

The canonical markdown lives in the repo root (`curriculum/`, `docs/`,
`README.md`) so it stays readable on GitHub, where the labs' relative links to
source files are the whole point. `scripts/sync-docs.mjs` copies that markdown
into `website/docs/`, lifts each H1 into frontmatter, and rewrites every
relative link:

| Link target | Becomes |
|---|---|
| A page the site publishes | an internal route, e.g. `/docs/solutions/lab-2` |
| A repo file (`src/schemas.ts`) | a GitHub `blob/main` URL |
| A repo directory (`curriculum/solutions`) | a GitHub `tree/main` URL |

The sync runs automatically via `prestart` and `prebuild`, so the site can
never serve stale content. To add or reorder a page, edit the `PAGES` array in
[`scripts/sync-docs.mjs`](scripts/sync-docs.mjs) and the sidebar in
[`sidebars.ts`](sidebars.ts).

Point the GitHub links at a different repo with `DOCS_GITHUB_BASE`:

```bash
DOCS_GITHUB_BASE=https://github.com/you/your-fork/blob/main npm run build
```

## Notes on the config

`markdown.format` is `detect`, so `.md` files are parsed as CommonMark rather
than MDX. The lab markdown contains `<customer_message>` tags and bare braces
that MDX would try to read as JSX and reject.

`onBrokenLinks` is `throw`. A broken link means a lab sends a learner to a 404
mid-exercise, so that should fail the build rather than ship.

## Deploying

`npm run build` emits static files to `build/`.

**URL config is automatic.** Vercel sets `VERCEL=1` on every build, so the
config picks the right shape without a hand edit:

| Target | `baseUrl` | Why |
|---|---|---|
| Vercel | `/` | served at a domain root |
| GitHub Pages | `/<repo>/` | served under a repo path |

Getting that wrong is the classic "every asset 404s in production" bug, so it
is derived rather than typed.

### Vercel

Deploy from the **repo root**, not from `website/`. The sync script reads
`curriculum/` from the parent directory, so a website-rooted deploy would build
with no content. Config lives in [`../vercel.json`](../vercel.json) and
[`../.vercelignore`](../.vercelignore).

```bash
vercel
```

```bash
vercel --prod
```

### GitHub Pages

```bash
npm run build && npm run serve
```

Then publish `build/` however you normally do.

### Pointing at your own repo

Four env vars override the defaults, and they feed both this config and the
link rewriting in the sync script:

| Variable | Default |
|---|---|
| `DOCS_GITHUB_ORG` | `mrlynn` |
| `DOCS_GITHUB_REPO` | `claude-triage-api` |
| `DOCS_GITHUB_REF` | `main` |
| `DOCS_SITE_URL` / `DOCS_BASE_URL` | derived from the target |

```bash
DOCS_GITHUB_ORG=you DOCS_GITHUB_REPO=your-repo npm run build
```
