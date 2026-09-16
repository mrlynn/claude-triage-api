#!/usr/bin/env bash
# Storefront (northwind-outfitters) — Ignored Build Step.
# Exit 0 = skip this deploy. Exit 1 = build.
#
# Always resolves to the git root and diffs storefront/, so this works whether
# Vercel runs from the repo root or Root Directory = storefront.

set -u

root="$(git rev-parse --show-toplevel)"
cd "$root"

prev="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"

if ! git cat-file -e "${prev}^{commit}" 2>/dev/null; then
  echo "vercel-ignore-storefront: previous SHA unavailable — building"
  exit 1
fi

# Building the commit that is already deployed is a deliberate redeploy, most
# often to pick up a changed environment variable. Diffing a commit against
# itself finds nothing, so without this every redeploy was silently skipped
# and new variables never reached the running site.
if [ "$(git rev-parse "$prev")" = "$(git rev-parse HEAD)" ]; then
  echo "vercel-ignore-storefront: redeploy of the deployed commit — building"
  exit 1
fi

if git diff --quiet "$prev" HEAD -- storefront/; then
  echo "vercel-ignore-storefront: no changes under storefront/ — skipping"
  exit 0
fi

echo "vercel-ignore-storefront: storefront/ changed — building"
exit 1
