"""The scoreboard, in Python. Mirrors evals/quick.ts.

Reads the SAME gold set as the TypeScript harness — `evals/dataset.jsonl` at
the repo root. There is one gold set, not two, and that is deliberate: two
copies drift, and then you are comparing languages rather than measuring
either.

    .venv/bin/python -m evals.quick
    .venv/bin/python -m evals.quick --save
    .venv/bin/python -m evals.quick --gate

It writes its own baseline (`python/evals/baseline.json`) because the two
implementations legitimately score differently — see labs/deltas.md on why the
JSON Schema differs — and comparing a Python run against a TypeScript baseline
would attribute an SDK difference to your prompt change.
"""

import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from triage.client import assert_credentials
from triage.config import MODEL
from triage.server import app

REPO_ROOT = Path(__file__).resolve().parents[2]
DATASET = REPO_ROOT / "evals" / "dataset.jsonl"
BASELINE = Path(__file__).resolve().parent / "baseline.json"

THRESHOLD = 0.8


@dataclass
class CaseResult:
    id: str
    passed: bool
    failures: list[str]
    confidence: float
    cost_usd: float
    notes: str


def load_cases() -> list[dict]:
    return [
        json.loads(line)
        for line in DATASET.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def score(client: TestClient, cases: list[dict]) -> list[CaseResult]:
    results: list[CaseResult] = []

    for case in cases:
        res = client.post("/v1/triage", json={"message": case["message"]})

        if res.status_code != 200:
            # A transport failure is a FAILING case, not a skipped one.
            # Dropping it would quietly shrink the denominator.
            results.append(
                CaseResult(case["id"], False, [f"HTTP {res.status_code}"], 0.0, 0.0, case["notes"])
            )
            continue

        body = res.json()
        got, want = body["triage"], case["expected"]
        failures: list[str] = []

        for field in ("category", "urgency", "requires_human"):
            if got[field] != want[field]:
                failures.append(f"{field}: expected {want[field]}, got {got[field]}")
        if got["entities"]["requested_remedy"] != want["requested_remedy"]:
            failures.append(
                f"requested_remedy: expected {want['requested_remedy']}, "
                f"got {got['entities']['requested_remedy']}"
            )

        results.append(
            CaseResult(
                case["id"],
                not failures,
                failures,
                got["confidence"],
                body["meta"]["usage"]["estimated_cost_usd"],
                case["notes"],
            )
        )

    return results


def mean(xs: list[float]) -> float | None:
    """None, not 0, on an empty list.

    Averaging the empty set to zero is how a model that scored 12/12 reports a
    calibration gap equal to its mean pass confidence — separation it never
    demonstrated. The TypeScript version made exactly this mistake first.
    """
    return sum(xs) / len(xs) if xs else None


def main() -> None:
    assert_credentials()
    save = "--save" in sys.argv
    gate = "--gate" in sys.argv

    cases = load_cases()
    with TestClient(app) as client:
        results = score(client, cases)

    passed = sum(1 for r in results if r.passed)
    accuracy = passed / len(results) if results else 0.0
    cost = sum(r.cost_usd for r in results)

    on_pass = mean([r.confidence for r in results if r.passed])
    on_fail = mean([r.confidence for r in results if not r.passed])
    gap = on_pass - on_fail if on_pass is not None and on_fail is not None else None
    fmt = lambda v: "n/a" if v is None else f"{v:.2f}"

    for r in results:
        print(f"{'PASS' if r.passed else 'FAIL'}  {r.id}  conf {r.confidence:.2f}")
        for f in r.failures:
            print(f"        {f}")
        if not r.passed:
            # Check the LABEL before you check the model.
            print(f"        note: {r.notes}")

    prev = json.loads(BASELINE.read_text()) if BASELINE.exists() else None
    delta = "no baseline yet" if prev is None else (
        f"Δ {passed - prev['passed']:+d} vs baseline ({prev['passed']}/{prev['total']})"
    )

    print(f"\naccuracy {passed}/{len(results)} ({accuracy * 100:.1f}%) · ${cost:.4f} · {delta}")
    print(
        f"confidence: {fmt(on_pass)} on passes, {fmt(on_fail)} on failures "
        f"(gap {fmt(gap)} — the gap is the signal)"
    )

    if prev is not None:
        now_passing = {r.id for r in results if r.passed}
        was_passing = set(prev["passing_ids"])
        broke = sorted(was_passing - now_passing)
        fixed = sorted(now_passing - was_passing)
        if broke:
            print(f"regressed: {', '.join(broke)}")
        if fixed:
            print(f"newly passing: {', '.join(fixed)}")
        if broke or fixed:
            print("  (this set moves by up to 2 cases run-to-run on its own — "
                  "read the case ids, not the delta)")

    if save:
        BASELINE.write_text(
            json.dumps(
                {
                    "recorded_at": datetime.now(timezone.utc).isoformat(),
                    "model": MODEL,
                    "runtime": "python",
                    "accuracy": accuracy,
                    "passed": passed,
                    "total": len(results),
                    "passing_ids": [r.id for r in results if r.passed],
                },
                indent=2,
            )
            + "\n"
        )
        print(f"\nbaseline updated: {BASELINE}")

    if gate and accuracy < THRESHOLD:
        print(f"\nGATE FAILED: {accuracy * 100:.1f}% is below {THRESHOLD * 100:.0f}%.", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
