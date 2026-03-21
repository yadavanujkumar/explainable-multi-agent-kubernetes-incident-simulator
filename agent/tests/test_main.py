"""Tests for the XAI Kubernetes Agent FastAPI application."""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# Ensure mock mode during testing
os.environ.setdefault("OPENAI_API_KEY", "dummy")

from main import _build_chain, _parse_chain_output, app  # noqa: E402


@pytest.fixture(autouse=True)
def _clear_lru_cache():
    """Reset the cached LangChain chain between tests."""
    _build_chain.cache_clear()
    yield
    _build_chain.cache_clear()


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


# ─────────────────────────────────────────────
# Health endpoint
# ─────────────────────────────────────────────


def test_health(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data


# ─────────────────────────────────────────────
# /api/v1/explain – mock mode (no API key)
# ─────────────────────────────────────────────


def test_explain_mock_mode(client: TestClient) -> None:
    """When OPENAI_API_KEY is 'dummy', the endpoint returns a mock response."""
    payload = {
        "cluster_id": "vcluster-user01",
        "misconfig_type": "rbac-denial",
        "user_query": "Why is my pod getting a 403?",
    }
    response = client.post("/api/v1/explain", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "explanation" in data
    assert "suggested_hint" in data
    assert data["explanation"].startswith("(Mock)")


def test_explain_validation_empty_user_query(client: TestClient) -> None:
    payload = {
        "cluster_id": "vcluster-user01",
        "misconfig_type": "rbac-denial",
        "user_query": "",
    }
    response = client.post("/api/v1/explain", json=payload)
    assert response.status_code == 422


def test_explain_validation_invalid_cluster_id(client: TestClient) -> None:
    payload = {
        "cluster_id": "bad/id;injection",
        "misconfig_type": "rbac-denial",
        "user_query": "Why is my pod failing?",
    }
    response = client.post("/api/v1/explain", json=payload)
    assert response.status_code == 422


def test_explain_validation_missing_field(client: TestClient) -> None:
    payload = {
        "cluster_id": "vcluster-user01",
        # misconfig_type missing
        "user_query": "Help me",
    }
    response = client.post("/api/v1/explain", json=payload)
    assert response.status_code == 422


def test_explain_validation_long_query(client: TestClient) -> None:
    payload = {
        "cluster_id": "vcluster-user01",
        "misconfig_type": "rbac-denial",
        "user_query": "x" * 2001,  # over 2000-char limit
    }
    response = client.post("/api/v1/explain", json=payload)
    assert response.status_code == 422


# ─────────────────────────────────────────────
# /api/v1/explain – with a mocked LLM chain
# ─────────────────────────────────────────────


def test_explain_with_chain(client: TestClient) -> None:
    """When a chain is available the response is parsed from its output."""
    mock_chain = MagicMock()
    mock_chain.run.return_value = (
        "EXPLANATION: RBAC controls who can access what.\n"
        "HINT: Check if the ServiceAccount has a bound Role."
    )

    with patch("main._build_chain", return_value=mock_chain):
        with patch("main._run_chain", return_value=mock_chain.run.return_value):
            payload = {
                "cluster_id": "vcluster-user01",
                "misconfig_type": "rbac-denial",
                "user_query": "Why is my pod getting a 403?",
            }
            response = client.post("/api/v1/explain", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert "explanation" in data
    assert "suggested_hint" in data


# ─────────────────────────────────────────────
# _parse_chain_output unit tests
# ─────────────────────────────────────────────


def test_parse_chain_output_structured() -> None:
    raw = "EXPLANATION: Something happened.\nHINT: Try this thing."
    explanation, hint = _parse_chain_output(raw)
    assert explanation == "Something happened."
    assert hint == "Try this thing."


def test_parse_chain_output_unstructured() -> None:
    """Falls back gracefully when the LLM doesn't follow the template."""
    raw = "The pod is failing because of missing permissions."
    explanation, hint = _parse_chain_output(raw)
    # Both should be non-empty
    assert explanation
    assert hint
