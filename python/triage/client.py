"""One client for the whole process. Mirrors src/anthropic.ts.

THE DIFFERENCE THAT BITES: `timeout` is in SECONDS here and MILLISECONDS in
the TypeScript SDK. Both default to 10 minutes, so `timeout=120` and
`timeout: 120_000` are the same fuse — and copying the number across without
converting gives you a 120-millisecond timeout that fails every call, or a
120,000-second one that never fires.
"""

import os

import anthropic

client = anthropic.Anthropic(
    max_retries=3,
    # Seconds. Two minutes, not the 10-minute default: an eval runner wants a
    # short fuse, and with max_retries=3 a wedged request at the default would
    # hold the runner for ~40 minutes.
    timeout=120.0,
)


def assert_credentials() -> None:
    if not os.environ.get("ANTHROPIC_API_KEY") and not os.environ.get(
        "ANTHROPIC_AUTH_TOKEN"
    ):
        raise SystemExit(
            "No Anthropic credentials found. Copy .env.example to .env at the "
            "repo root and set ANTHROPIC_API_KEY, or export it in your shell."
        )
