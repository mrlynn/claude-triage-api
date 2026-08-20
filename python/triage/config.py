"""Central configuration. Mirrors src/config.ts.

The Python and TypeScript services must agree on the model, the effort, and
the pricing, or the two halves of the course produce different numbers for the
same work and everyone loses an hour finding out why.
"""

import os
from dataclasses import dataclass

MODEL_TIERS = {
    "flagship": "claude-opus-5",
    "balanced": "claude-sonnet-5",
    "fast": "claude-haiku-4-5",
}

MODEL = os.environ.get("TRIAGE_MODEL", MODEL_TIERS["flagship"])

# `effort` lives inside output_config, not at the top level. Same in both SDKs.
EFFORT = {"triage": "low", "resolve": "high", "draft": "medium"}

MAX_TOKENS = {"non_streaming": 16_000, "streaming": 64_000}


@dataclass(frozen=True)
class ModelSpec:
    input_per_mtok: float
    output_per_mtok: float
    cache_write_multiplier: float
    cache_read_multiplier: float
    batch_multiplier: float
    # Haiku 4.5 rejects output_config.effort with a 400. Tiering is not a name
    # swap in Python either.
    supports_effort: bool
    context_window: int


MODEL_CATALOG: dict[str, ModelSpec] = {
    "claude-opus-5": ModelSpec(5.0, 25.0, 1.25, 0.1, 0.5, True, 1_000_000),
    "claude-sonnet-5": ModelSpec(3.0, 15.0, 1.25, 0.1, 0.5, True, 1_000_000),
    "claude-haiku-4-5": ModelSpec(1.0, 5.0, 1.25, 0.1, 0.5, False, 200_000),
}


def spec_for(model: str) -> ModelSpec:
    """Raises on an unknown model rather than defaulting to flagship rates.

    Same reasoning as the TypeScript version: a cost table that silently
    guesses is worse than one that crashes, because you find out at the
    invoice instead of at the call site.
    """
    if model in MODEL_CATALOG:
        return MODEL_CATALOG[model]

    # Dated snapshots (claude-haiku-4-5-20251001) price as their base model.
    undated = model.rsplit("-", 1)[0] if model.rsplit("-", 1)[-1].isdigit() else model
    if undated in MODEL_CATALOG:
        return MODEL_CATALOG[undated]

    raise ValueError(
        f'No pricing or capability data for model "{model}". '
        f"Add a row to MODEL_CATALOG in triage/config.py "
        f"(verify rates at https://claude.com/pricing). "
        f"Known: {', '.join(MODEL_CATALOG)}."
    )


PORT = int(os.environ.get("PORT", "8788"))
