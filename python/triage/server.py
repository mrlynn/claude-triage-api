"""The service. Mirrors src/server.ts and src/routes/.

FastAPI rather than Hono, one file rather than four, because the Python half
exists to show what is DIFFERENT and a directory structure is not a difference
worth four files of ceremony.

Port 8788, so this and the TypeScript service can run side by side. Comparing
the two is the fastest way to settle "is this the API or is this my code?".
"""

import time

from fastapi import FastAPI
from fastapi.responses import JSONResponse

import anthropic

from .client import client
from .config import EFFORT, MODEL
from .requests_ import build_triage_request
from .schemas import TicketInput
from .usage import summarize_usage

app = FastAPI(title="claude-triage-api (python)")


@app.get("/")
def index() -> dict:
    return {
        "service": "claude-triage-api-python",
        "model": MODEL,
        "effort_by_route": EFFORT,
        "routes": {
            "POST /v1/triage": "Classify a ticket into a validated schema.",
            "GET /healthz": "Liveness.",
        },
        "note": "The Python mirror of src/. See python/labs/deltas.md.",
    }


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True}


@app.post("/v1/triage")
def triage(ticket: TicketInput) -> JSONResponse:
    started = time.time()

    try:
        # `client.messages.parse(**body)` — the Python SDK spreads the request
        # rather than taking an object, which is the main shape difference you
        # will notice porting a call.
        response = client.messages.parse(**build_triage_request(ticket))
    except anthropic.AuthenticationError:
        return JSONResponse(
            {
                "error": "upstream_auth_failed",
                "detail": "The service's Anthropic credentials were rejected.",
                "retryable": False,
            },
            status_code=500,
        )
    except anthropic.RateLimitError:
        return JSONResponse(
            {"error": "rate_limited", "detail": "Upstream rate limit.", "retryable": True},
            status_code=429,
        )
    except anthropic.BadRequestError as err:
        return JSONResponse(
            {"error": "invalid_upstream_request", "detail": str(err), "retryable": False},
            status_code=400,
        )
    except anthropic.APIConnectionError:
        return JSONResponse(
            {"error": "upstream_unreachable", "detail": "Connection failed.", "retryable": True},
            status_code=503,
        )

    # `parsed_output` in BOTH SDKs — a place the two agree, and worth knowing
    # so you do not go looking for a difference that is not there. Still
    # nullable, still the field people assert past in production.
    parsed = response.parsed_output
    if parsed is None:
        return JSONResponse(
            {
                "error": "unparseable_output",
                "detail": "The model response did not validate against the triage schema.",
                "stop_reason": response.stop_reason,
            },
            status_code=502,
        )

    return JSONResponse(
        {
            "triage": parsed.model_dump(),
            "meta": {
                "model": response.model,
                "stop_reason": response.stop_reason,
                "latency_ms": int((time.time() - started) * 1000),
                "usage": summarize_usage(response.usage, response.model).dict(),
            },
        }
    )
