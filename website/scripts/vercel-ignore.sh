#!/usr/bin/env bash
# Docs site (claude-triage-labs) — Ignored Build Step.
# Exit 0 = skip this deploy. Exit 1 = build.
#
# Always resolves to the git root so this works whether Vercel runs the
# command from "." or from a nested Root Directory.

set -u

root="$(git rev-parse --show-toplevel)"
cd "$root"

prev="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"

if ! git cat-file -e "${prev}^{commit}" 2>/dev/null; then
  echo "vercel-ignore-docs: previous SHA unavailable — building"
  exit 1
fi

# Anything sync-docs.mjs reads at build time has to be listed here, or a
# change to it produces a site that never rebuilds. python/labs/ is on the
# list because the Python deltas page is published as a doc; the rest of
# python/ is participant-only and never enters a Vercel build.
paths=(
  website/
  curriculum/
  docs/
  python/labs/
  assets/brand/
  README.md
  vercel.json
  .vercelignore
)

if git diff --quiet "$prev" HEAD -- "${paths[@]}"; then
  echo "vercel-ignore-docs: no relevant changes — skipping"
  exit 0
fi

echo "vercel-ignore-docs: relevant paths changed — building"
exit 1
