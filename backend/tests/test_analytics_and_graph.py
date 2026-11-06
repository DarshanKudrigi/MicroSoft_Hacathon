from __future__ import annotations
import pytest
from app.models import Incident, Review, ReviewComment, LearningEvent, GraphNode, GraphEdge

def test_analytics_and_dashboard_endpoints(client, db_session):
    # Seed a minimal set of data
    inc = Incident(
        service="payments",
        logs="timeout",
        root_cause="HikariCP pool leak",
        root_cause_category="connection_pool",
        confidence=0.92,
        status="resolved",
        minutes_to_resolve=20,
        memory_enabled=True,
        memory_id="mem_inc_12"
    )
    db_session.add(inc)
    db_session.commit()

    rev = Review(
        filename="webhook.py",
        service="payments",
        diff="+ code",
        summary="sum",
        memory_enabled=True
    )
    db_session.add(rev)
    db_session.commit()

    comment = ReviewComment(
        review_id=rev.id,
        line=10,
        severity="critical",
        issue="Unreleased conn",
        suggestion="close",
        because="Incident #12",
        memory_id="mem_rule_12",
        status="accepted",
        fingerprint="fp123"
    )
    db_session.add(comment)

    le = LearningEvent(
        type="rule_created",
        source_incident_id=inc.id,
        memory_id="mem_rule_12",
        detail="Rule created for CodeMind"
    )
    db_session.add(le)
    db_session.commit()

    # 1. Test Dashboard
    dash_res = client.get("/api/dashboard")
    assert dash_res.status_code == 200
    dash_data = dash_res.json()
    assert dash_data["total_incidents"] >= 1
    assert dash_data["active_rules"] >= 1
    assert "analytics" in dash_data

    # 2. Test Analytics
    ana_res = client.get("/api/analytics")
    assert ana_res.status_code == 200
    ana_data = ana_res.json()
    assert ana_data["repeat_issues_caught"] >= 1
    assert len(ana_data["manager_takeaways"]) >= 3
    assert ana_data["estimated_hours_saved"] > 0
    assert len(ana_data["service_breakdown"]) == 3

    # 3. Test Memories Explorer
    mem_res = client.get("/api/memories?service=payments")
    assert mem_res.status_code == 200
    mem_data = mem_res.json()
    assert len(mem_data["memories"]) >= 1

def test_knowledge_graph_endpoints(client, db_session):
    # Add graph node and edge
    n1 = GraphNode(id="node:service:payments", type="service", label="Payments", ref_id="payments", meta={})
    n2 = GraphNode(id="node:incident:99", type="incident", label="Incident 99", ref_id="99", meta={})
    edge = GraphEdge(id="edge:99:payments", src=n2.id, dst=n1.id, type="occurred_in")
    db_session.add_all([n1, n2, edge])
    db_session.commit()

    res = client.get("/api/graph")
    assert res.status_code == 200
    data = res.json()
    assert len(data["nodes"]) >= 2
    assert len(data["edges"]) >= 1

    # Node detail
    detail_res = client.get(f"/api/graph/nodes/{n2.id}")
    assert detail_res.status_code == 200
    d_data = detail_res.json()
    assert d_data["node"]["id"] == n2.id
    assert "connections" in d_data["related_records"]

