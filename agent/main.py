"""XAI Kubernetes Agent – FastAPI application.

Provides a single endpoint that leverages LangChain + OpenAI to generate
pedagogical, Socratic hints for engineers remediating Kubernetes incidents.
"""

from __future__ import annotations

import logging
import os
import re
import sys
from functools import lru_cache

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from langchain.chains import LLMChain
from langchain.prompts import PromptTemplate
from langchain_openai import OpenAI
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel, Field, field_validator
from tenacity import RetryError, retry, stop_after_attempt, wait_exponential

# ─────────────────────────────────────────────
# Structured logging
# ─────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# Constants / configuration
# ─────────────────────────────────────────────

APP_VERSION = os.getenv("APP_VERSION", "1.0.0")
_VALID_IDENTIFIER_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]{1,128}$")

# ─────────────────────────────────────────────
# FastAPI application
# ─────────────────────────────────────────────

app = FastAPI(
    title="XAI Kubernetes Agent",
    version=APP_VERSION,
    description="Explainable AI tutor for Kubernetes incident simulation.",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "").split(",") or ["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Expose /metrics for Prometheus scraping
Instrumentator().instrument(app).expose(app)


# ─────────────────────────────────────────────
# Global exception handler
# ─────────────────────────────────────────────


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


# ─────────────────────────────────────────────
# Request / response models
# ─────────────────────────────────────────────


class IncidentContext(BaseModel):
    cluster_id: str = Field(..., min_length=1, max_length=128)
    misconfig_type: str = Field(..., min_length=1, max_length=128)
    user_query: str = Field(..., min_length=1, max_length=2000)

    @field_validator("cluster_id", "misconfig_type")
    @classmethod
    def _no_special_chars(cls, value: str) -> str:
        if not _VALID_IDENTIFIER_PATTERN.match(value):
            raise ValueError("Field contains invalid characters")
        return value


class ExplanationResponse(BaseModel):
    explanation: str
    suggested_hint: str


class HealthResponse(BaseModel):
    status: str
    version: str


# ─────────────────────────────────────────────
# LangChain chain (cached per process)
# ─────────────────────────────────────────────

_PROMPT_TEMPLATE = """\
You are an expert Kubernetes DevSecOps tutor with deep knowledge of RBAC,
NetworkPolicies, ResourceQuotas, and admission controllers.

The user has encountered a '{misconfig_type}' misconfiguration inside cluster '{cluster_id}'.
User asks: {user_query}

Provide:
1. A concise explanation (2-3 sentences) of the underlying Kubernetes concept.
2. ONE small, actionable hint that guides the engineer toward the fix without
   revealing the full solution.

Format your response as:
EXPLANATION: <explanation text>
HINT: <hint text>
"""


@lru_cache(maxsize=1)
def _build_chain() -> LLMChain | None:
    """Build and cache the LangChain pipeline. Returns None in mock mode."""
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key or api_key == "dummy":
        logger.warning("OPENAI_API_KEY not set – running in mock mode")
        return None
    try:
        llm = OpenAI(temperature=0.3, openai_api_key=api_key, max_tokens=512)
        prompt = PromptTemplate(
            template=_PROMPT_TEMPLATE,
            input_variables=["misconfig_type", "cluster_id", "user_query"],
        )
        return LLMChain(llm=llm, prompt=prompt)
    except Exception:
        logger.exception("Failed to initialise LangChain – running in mock mode")
        return None


def _parse_chain_output(raw: str) -> tuple[str, str]:
    """Extract EXPLANATION and HINT sections from the LLM output."""
    explanation, hint = "", raw.strip()
    for line in raw.splitlines():
        if line.startswith("EXPLANATION:"):
            explanation = line.removeprefix("EXPLANATION:").strip()
        elif line.startswith("HINT:"):
            hint = line.removeprefix("HINT:").strip()
    return explanation or raw.strip(), hint


# ─────────────────────────────────────────────
# LLM call with retry
# ─────────────────────────────────────────────


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    reraise=True,
)
def _run_chain(chain: LLMChain, payload: dict) -> str:
    return chain.run(payload)


# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────


@app.get("/healthz", response_model=HealthResponse, tags=["ops"])
def health() -> HealthResponse:
    return HealthResponse(status="ok", version=APP_VERSION)


@app.post(
    "/api/v1/explain",
    response_model=ExplanationResponse,
    status_code=status.HTTP_200_OK,
    tags=["xai"],
    summary="Explain a Kubernetes misconfiguration",
)
async def explain_incident(context: IncidentContext) -> ExplanationResponse:
    logger.info(
        "explain request cluster=%s misconfig=%s",
        context.cluster_id,
        context.misconfig_type,
    )

    chain = _build_chain()

    if chain is None:
        return ExplanationResponse(
            explanation=(
                "(Mock) An RBAC misconfiguration prevents the service account "
                "from accessing the required resource."
            ),
            suggested_hint=(
                "(Mock) Inspect the RoleBinding in the affected namespace and "
                "verify the subject matches your service account name."
            ),
        )

    payload = {
        "misconfig_type": context.misconfig_type,
        "cluster_id": context.cluster_id,
        "user_query": context.user_query,
    }

    try:
        raw = _run_chain(chain, payload)
    except RetryError as exc:
        logger.error("LLM call failed after retries: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service temporarily unavailable – please retry",
        ) from exc
    except Exception as exc:
        logger.exception("Unexpected error during chain execution")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal XAI error",
        ) from exc

    explanation, hint = _parse_chain_output(raw)
    logger.info("explain response cluster=%s", context.cluster_id)
    return ExplanationResponse(explanation=explanation, suggested_hint=hint)

