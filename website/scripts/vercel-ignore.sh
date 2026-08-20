#!/usr/bin/env bash
# Docs site (claude-triage-labs) — Ignored Build Step.
# Exit 0 = skip this deploy. Exit 1 = build.
#
# Runs from the repo root (Root Directory must be "." / empty).
# Prefer this over the dashboard presets: vercel.json ignoreCommand overrides them.

set -u

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
