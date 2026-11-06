from __future__ import annotations
import pytest
from app.schemas import HealthResponse

def test_health_check_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()

    # Validate against Pydantic schema
    health = HealthResponse.model_validate(data)
    assert health.database.connected is True
    assert health.database.dialect == "sqlite"
    assert health.llm.provider == "groq"
    assert health.llm.primary_model == "openai/gpt-oss-120b"
    assert health.llm.fallback_model == "qwen/qwen3-32b"
    assert health.memory.provider == "hindsight"
    assert health.memory.bank_id == "nexus-org"
    assert health.status in ("ok", "degraded")

def test_root_endpoint(client):
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "Nexus AI API" in data["message"]

