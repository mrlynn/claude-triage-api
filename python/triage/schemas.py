"""The output contract. Mirrors src/schemas.ts.

Pydantic rather than Zod, and the mapping is close enough to be boring:

    z.object({...})            -> class Model(BaseModel)
    .describe("...")           -> Field(description="...")
    z.enum([...])              -> Literal[...]
    z.infer<typeof S>          -> the class itself

The important property survives the translation: `description` text is
compiled into the JSON Schema the model sees, so it is the highest-leverage
per-field control you have, not documentation. Deleting the calibration
sentence on `confidence` collapses the calibration gap in Python exactly as it
does in TypeScript — Lab 2 Step 2 works unchanged.
"""

from typing import Literal

from pydantic import BaseModel, Field

Category = Literal[
    "billing",
    "shipping",
    "product_defect",
    "returns",
    "account",
    "safety",
    "other",
]
Urgency = Literal["low", "normal", "high", "urgent"]
Sentiment = Literal["angry", "frustrated", "neutral", "positive"]


class Entities(BaseModel):
    """Structured facts lifted from the message with no inference."""

    order_ids: list[str] = Field(
        description="Order identifiers mentioned, verbatim (e.g. 'NW-48211'). Empty array if none."
    )
    product_names: list[str] = Field(
        description="Product names mentioned. Empty array if none."
    )
    requested_remedy: Literal[
        "refund", "replacement", "information", "cancellation", "escalation", "none"
    ] = Field(
        description="What the customer explicitly asked for, not what you think they should get."
    )


class TriageResult(BaseModel):
    category: Category = Field(
        description="The single best-fitting category, using the definitions in section 8 of the policy handbook."
    )
    urgency: Urgency = Field(
        description="Urgency per the definitions in section 8. Safety reports are always 'urgent'."
    )
    sentiment: Sentiment = Field(
        description="The customer's emotional register, not the severity of the issue."
    )
    summary: str = Field(
        description="One sentence, under 25 words, stating what the customer wants. Written for an agent skimming a queue."
    )
    entities: Entities
    requires_human: bool = Field(
        description="True if policy section 5.3 mandates supervisor escalation, or if a confident automated reply is not possible."
    )
    escalation_reason: str | None = Field(
        description="Why a human is required, or null when requires_human is false."
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Your calibrated confidence in this classification. Use the full range — a genuinely ambiguous ticket should score near 0.5, not 0.9.",
    )


class TicketInput(BaseModel):
    message: str = Field(min_length=1, max_length=20_000)
    customer_email: str | None = None
    channel: Literal["email", "chat", "phone_transcript"] = "email"
