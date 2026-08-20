"""Request construction, in one place. Mirrors src/lib/requests.ts.

Named `requests_` with the trailing underscore so it cannot shadow the very
popular `requests` HTTP library on the import path — a real hazard in a
Python project and a good example of a problem that simply does not exist in
the TypeScript half.
"""

from .config import EFFORT, MAX_TOKENS, MODEL, spec_for
from .prompts import build_system, volatile_context
from .schemas import TicketInput, TriageResult
from .untrusted import wrap_untrusted


def output_config_for(model: str, effort: str) -> tuple[dict, bool]:
    """Applies output_config in a way the target model actually accepts.

    Haiku 4.5 returns a 400 for `effort`. Rather than making every caller
    remember, consult the catalog and drop the field — reporting that it was
    dropped, so an eval can label the run honestly instead of quietly
    comparing a low-effort model against a no-effort one.
    """
    if not spec_for(model).supports_effort:
        return {}, False
    return {"effort": effort}, True


def build_triage_request(ticket: TicketInput, model: str | None = None) -> dict:
    """The /v1/triage request body, byte-compatible with the TypeScript one."""
    chosen = model or MODEL
    config, _ = output_config_for(chosen, EFFORT["triage"])

    return {
        "model": chosen,
        "max_tokens": MAX_TOKENS["non_streaming"],
        "system": build_system(
            "triage",
            volatile_context(ticket.channel, ticket.customer_email),
        ),
        # THE SHAPE DIFFERENCE THAT COSTS YOU AN HOUR. In TypeScript both the
        # effort and the schema live inside output_config:
        #
        #     output_config: { effort, format: zodOutputFormat(TriageSchema) }
        #
        # In the Python SDK, `messages.parse()` takes the pydantic class as a
        # SEPARATE top-level `output_format` argument, and output_config
        # carries only the effort. Passing the model class inside
        # output_config["format"] fails at JSON serialization with
        # "Object of type ModelMetaclass is not JSON serializable" — a message
        # that does not point anywhere near the actual mistake.
        "output_config": config,
        "output_format": TriageResult,
        "messages": [
            {
                "role": "user",
                "content": (
                    f"Classify this inbound {ticket.channel} message.\n\n"
                    f"{wrap_untrusted(ticket.message)}"
                ),
            }
        ],
    }
