#!/usr/bin/env bash
#
# Runs once, when the container is created.
#
# The point of this file is the first thirty minutes of Day 1. Without it,
# those minutes go to Node versions, a missing `jq`, and three people whose
# npm install is still running while everyone else starts Lab 0. The
# instructor guide lists `jq` as the prerequisite people most often lack;
# this installs it and stops it being a prerequisite.
set -euo pipefail

echo "Installing jq and curl..."
sudo apt-get update -qq
sudo apt-get install -y -qq jq curl >/dev/null

echo "Installing dependencies (three workspaces)..."
npm ci
(cd website && npm ci)
(cd storefront && npm ci)

# A key is per-learner and never baked into an image. The devcontainer.json
# forwards ANTHROPIC_API_KEY from the host when one is set; otherwise the
# learner writes .env themselves, which is Lab setup step one either way.
if [ ! -f .env ]; then
  cp .env.example .env
  echo
  echo "Created .env from .env.example."
fi

echo
echo "=============================================================="
echo " Ready."
echo
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo " ANTHROPIC_API_KEY was forwarded from your host."
else
  echo " NEXT: put your key in .env"
  echo "   ANTHROPIC_API_KEY=sk-ant-..."
fi
echo
echo " Then verify with:   npm run smoke        (~\$0.15)"
echo " Then start here:    curriculum/labs/lab-0-scoreboard.md"
echo "=============================================================="
