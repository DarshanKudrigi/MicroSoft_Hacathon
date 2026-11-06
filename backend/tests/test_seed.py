from __future__ import annotations
import pytest
from app.models import Incident, IncidentStep, PullRequest, GraphNode, GraphEdge

def test_admin_seed_endpoint_unauthorized(client):
    res = client.post("/api/admin/seed")
    assert res.status_code == 401

def test_admin_seed_endpoint_success(client, db_session):
    headers = {"X-API-Key": "test-secret-key"}
    res = client.post("/api/admin/seed", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["incidents_seeded"] == 40
    assert data["incident_12_id"] == 12

    # Query DB to verify
    incidents = db_session.query(Incident).all()
    assert len(incidents) == 40

    inc12 = db_session.query(Incident).filter(Incident.id == 12).first()
    assert inc12 is not None
    assert inc12.service == "payments"
    assert inc12.root_cause_category.value == "connection_pool"
    assert inc12.minutes_to_resolve == 25
    assert "HikariPool" in inc12.logs

    steps = db_session.query(IncidentStep).filter(IncidentStep.incident_id == 12).all()
    assert len(steps) >= 2

    # Verify PRs and Graph Nodes
    prs = db_session.query(PullRequest).all()
    assert len(prs) >= 3

    nodes = db_session.query(GraphNode).all()
    assert len(nodes) >= 10

    edges = db_session.query(GraphEdge).all()
    assert len(edges) >= 5

