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

paths=(
  website/
  curriculum/
  docs/
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
