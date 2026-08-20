"""Token and cost accounting. Mirrors src/lib/usage.ts.

Total input is the SUM of three fields, not just `input_tokens`. Log only the
first and a cached workload looks almost free right up until the cache breaks.
"""

from dataclasses import dataclass, asdict

from .config import spec_for


@dataclass
class UsageReport:
    model: str
    batch: bool
    input_tokens: int
    output_tokens: int
    cache_creation_input_tokens: int
    cache_read_input_tokens: int
    total_input_tokens: int
    cache_hit: bool
    estimated_cost_usd: float
    uncached_cost_usd: float
    savings_usd: float

    def dict(self) -> dict:
        return asdict(self)


def summarize_usage(usage, model: str, batch: bool = False) -> UsageReport:
    cache_write = getattr(usage, "cache_creation_input_tokens", 0) or 0
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    fresh = usage.input_tokens
    total_input = fresh + cache_write + cache_read

    pricing = spec_for(model)
    discount = pricing.batch_multiplier if batch else 1.0
    in_rate = (pricing.input_per_mtok / 1_000_000) * discount
    out_rate = (pricing.output_per_mtok / 1_000_000) * discount

    cost = (
        fresh * in_rate
        + cache_write * in_rate * pricing.cache_write_multiplier
        + cache_read * in_rate * pricing.cache_read_multiplier
        + usage.output_tokens * out_rate
    )
    uncached = total_input * in_rate + usage.output_tokens * out_rate

    r6 = lambda n: round(n, 6)
    return UsageReport(
        model=model,
        batch=batch,
        input_tokens=fresh,
        output_tokens=usage.output_tokens,
        cache_creation_input_tokens=cache_write,
        cache_read_input_tokens=cache_read,
        total_input_tokens=total_input,
        cache_hit=cache_read > 0,
        estimated_cost_usd=r6(cost),
        uncached_cost_usd=r6(uncached),
        savings_usd=r6(uncached - cost),
    )
