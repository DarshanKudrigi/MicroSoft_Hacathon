from __future__ import annotations
import pytest
from unittest.mock import patch, AsyncMock
from app.models import Incident, LearningEvent, GraphNode, GraphEdge

def test_sentinel_diagnose_memory_off(client):
    payload = {
        "service": "payments",
        "logs": "HikariPool-1 - Connection is not available, request timed out after 30005ms.",
        "memory_enabled": False
    }
    res = client.post("/api/sentinel/diagnose", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["service"] == "payments"
    assert data["memory_enabled"] is False
    assert len(data["recalled_memories"]) == 0
    assert data["analysis"]["confidence"] <= 0.55
    assert len(data["analysis"]["usedMemories"]) == 0
    assert data["incident_id"] > 0

def test_sentinel_diagnose_memory_on(client):
    payload = {
        "service": "payments",
        "logs": (
            "HikariPool-1 - Connection is not available, request timed out after 30005ms.\n"
            "org.postgresql.util.PSQLException: FATAL: remaining connection slots are reserved"
        ),
        "memory_enabled": True
    }
    
    mock_recalled = [
        {"id": "mem_inc12", "text": "Incident #12: HikariCP connection pool exhausted in payments", "tags": ["agent:sentinel"], "confidence": 0.96}
    ]

    with patch("app.memory.HindsightMemoryService.is_available", return_value=True):
        with patch("app.memory.HindsightMemoryService.recall", new_callable=AsyncMock) as mock_recall:
            mock_recall.return_value = mock_recalled
            
            res = client.post("/api/sentinel/diagnose", json=payload)
            assert res.status_code == 200
            data = res.json()
            assert data["memory_enabled"] is True
            assert len(data["recalled_memories"]) == 1
            assert data["recalled_memories"][0]["id"] == "mem_inc12"

def test_sentinel_outcome_worked(client, db_session):
    # First create an incident
    inc = Incident(
        service="payments",
        logs="Connection pool exhausted",
        root_cause="Unreleased connection in webhook error handler",
        root_cause_category="connection_pool",
        confidence=0.9,
        status="open",
        memory_enabled=True
    )
    db_session.add(inc)
    db_session.commit()
    inc_id = inc.id

    outcome_payload = {
        "worked": True,
        "minutesToResolve": 18
    }

    res = client.post(f"/api/sentinel/incidents/{inc_id}/outcome", json=outcome_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "resolved"
    assert data["minutes_to_resolve"] == 18
    assert data["rule_id"] is not None

    # Verify incident updated in DB
    db_inc = db_session.query(Incident).filter(Incident.id == inc_id).first()
    assert db_inc.status == "resolved"
    assert db_inc.minutes_to_resolve == 18

    # Verify learning event was created for CodeMind
    event = db_session.query(LearningEvent).filter(LearningEvent.source_incident_id == inc_id).first()
    assert event is not None
    assert event.type == "rule_created"

    # Verify Graph Node & Edge
    rule_node = db_session.query(GraphNode).filter(GraphNode.id == f"node:rule:incident-{inc_id}").first()
    assert rule_node is not None

    edge = db_session.query(GraphEdge).filter(
        GraphEdge.src == f"node:incident:{inc_id}",
        GraphEdge.type == "derived_rule"
    ).first()
    assert edge is not None

