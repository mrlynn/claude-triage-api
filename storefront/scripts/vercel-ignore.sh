#!/usr/bin/env bash
# Storefront (northwind-outfitters) — Ignored Build Step.
# Exit 0 = skip this deploy. Exit 1 = build.
#
# Runs with Root Directory = storefront, so "." is this app only.
# Policy changes land here via `npm run sync:storefront` (vendored copy).

set -u

prev="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"

if ! git cat-file -e "${prev}^{commit}" 2>/dev/null; then
  echo "vercel-ignore-storefront: previous SHA unavailable — building"
  exit 1
fi

if git diff --quiet "$prev" HEAD -- .; then
  echo "vercel-ignore-storefront: no changes under storefront/ — skipping"
  exit 0
fi

echo "vercel-ignore-storefront: storefront/ changed — building"
exit 1
