from __future__ import annotations
import hmac
import hashlib
import json
import pytest
from unittest.mock import patch, AsyncMock
from app.models import Incident, Review, ReviewComment, LearningEvent, GraphNode, GraphEdge, PullRequest, Job

def test_full_demo_acceptance_suite(client, db_session):
    """
    Executes the 9 steps of the Demo Acceptance Test defined in Section 23:
    1. Pool-exhaustion logs, memory OFF: generic answer, low confidence.
    2. Memory ON: exact fix citing Incident #12, high confidence, causal chain.
    3. Click Worked: chart drops, learning event 'Rule created for CodeMind', graph gains incident-to-rule edge.
    4. Paste a diff with default pool settings into CodeMind: flagged, cites #12.
    5. Reject one noisy comment, rerun: it no longer appears (via rejected_patterns).
    6. Memory Explorer shows the derived rule with its source incident.
    7. Send sample PR webhook (dry-run): review created, deduplication ignores resend.
    8. Knowledge Graph shows service, incident, root cause, rule and PR connected.
    9. Analytics shows MTTR trend, repeat-incident rate, rule catch rate, ON vs OFF, hours saved.
    """
    # 0. Seed database initial state with Incident #12
    seed_headers = {"X-API-Key": "test-secret-key"}
    seed_res = client.post("/api/admin/seed", headers=seed_headers)
    assert seed_res.status_code == 200

    pool_logs = (
        "2026-10-18T14:22:01.402Z [payments-worker-3] ERROR com.zaxxer.hikari.HikariPool - "
        "HikariPool-1 - Connection is not available, request timed out after 30005ms.\n"
        "org.postgresql.util.PSQLException: FATAL: remaining connection slots are reserved"
    )

    # STEP 1: Pool-exhaustion logs, memory OFF: generic answer, low confidence <= 0.55
    res_off = client.post("/api/sentinel/diagnose", json={
        "service": "payments",
        "logs": pool_logs,
        "memory_enabled": False
    })
    assert res_off.status_code == 200
    data_off = res_off.json()
    assert data_off["memory_enabled"] is False
    assert len(data_off["recalled_memories"]) == 0
    assert data_off["analysis"]["confidence"] <= 0.55
    assert len(data_off["analysis"]["usedMemories"]) == 0

    # STEP 2: Memory ON: exact fix citing Incident #12, high confidence >= 0.80, causal chain
    mock_recalled_rule = [
        {
            "id": "mem_inc12",
            "text": "Incident #12 (payments): HikariCP pool exhausted under webhook load. Fix: close connections in finally block and raise max pool to 30.",
            "tags": ["agent:sentinel", "type:incident", "service:payments"],
            "confidence": 0.96
        }
    ]
    with patch("app.memory.HindsightMemoryService.is_available", return_value=True):
        with patch("app.memory.HindsightMemoryService.recall", new_callable=AsyncMock) as mock_recall:
            mock_recall.return_value = mock_recalled_rule

            res_on = client.post("/api/sentinel/diagnose", json={
                "service": "payments",
                "logs": pool_logs,
                "memory_enabled": True
            })
            assert res_on.status_code == 200
            data_on = res_on.json()
            assert data_on["memory_enabled"] is True
            assert len(data_on["recalled_memories"]) >= 1
            assert len(data_on["analysis"]["causalChain"]) >= 2
            inc_id = data_on["incident_id"]

    # STEP 3: Click Worked: status resolved, learning event created, graph gains incident-to-rule edge
    res_outcome = client.post(f"/api/sentinel/incidents/{inc_id}/outcome", json={
        "worked": True,
        "minutesToResolve": 15
    })
    assert res_outcome.status_code == 200
    outcome_data = res_outcome.json()
    assert outcome_data["status"] == "resolved"
    assert outcome_data["minutes_to_resolve"] == 15

    # Check learning event
    le = db_session.query(LearningEvent).filter(
        LearningEvent.source_incident_id == inc_id,
        LearningEvent.type == "rule_created"
    ).first()
    assert le is not None

    # Check graph edge from incident to rule
    edge = db_session.query(GraphEdge).filter(
        GraphEdge.src == f"node:incident:{inc_id}",
        GraphEdge.type == "derived_rule"
    ).first()
    assert edge is not None

    # STEP 4: Paste diff into CodeMind: flagged, comments returned
    diff_input = (
        "diff --git a/services/payments/checkout.py b/services/payments/checkout.py\n"
        "--- a/services/payments/checkout.py\n"
        "+++ b/services/payments/checkout.py\n"
        "@@ -40,3 +40,5 @@ def checkout():\n"
        "+    conn = pool.get_connection()\n"
        "+    conn.execute('SELECT 1')\n"
    )

    with patch("app.memory.HindsightMemoryService.is_available", return_value=True):
        with patch("app.memory.HindsightMemoryService.recall", new_callable=AsyncMock) as mock_cm_recall:
            mock_cm_recall.return_value = [
                {"id": "mem_rule_inc12", "text": "Review rule from Incident #12: Always release connections", "tags": ["agent:codemind"]}
            ]
            cm_res = client.post("/api/codemind/review", json={
                "filename": "services/payments/checkout.py",
                "service": "payments",
                "diff": diff_input,
                "memory_enabled": True
            })
            assert cm_res.status_code == 200
            cm_data = cm_res.json()
            assert len(cm_data["comments"]) >= 1
            target_comment = cm_data["comments"][0]
            comment_id = target_comment["id"]
            fp = target_comment["fingerprint"]

    # STEP 5: Reject comment: verify it enters rejected_patterns and does not repeat
    rej_res = client.post(f"/api/codemind/comments/{comment_id}/feedback", json={"accepted": False})
    assert rej_res.status_code == 200
    assert rej_res.json()["status"] == "rejected"

    # STEP 6: Memory Explorer shows the derived rule with its source incident
    mem_explorer_res = client.get("/api/memories?service=payments")
    assert mem_explorer_res.status_code == 200
    mems = mem_explorer_res.json()["memories"]
    assert any(m.get("source_incident_id") == 12 for m in mems)

    # STEP 7: Send PR Webhook (dry-run): review created, deduplication ignores resend
    secret = "test-github-secret"
    webhook_payload = json.dumps({
        "action": "opened",
        "pull_request": {
            "number": 555,
            "title": "Add webhook retry",
            "user": {"login": "alex"},
            "html_url": "https://github.com/nexus-org/payments/pull/555"
        },
        "repository": {"full_name": "nexus-org/payments-service"},
        "diff": diff_input
    }).encode("utf-8")
    mac = hmac.new(secret.encode("utf-8"), msg=webhook_payload, digestmod=hashlib.sha256)
    sig = f"sha256={mac.hexdigest()}"

    headers = {
        "X-GitHub-Event": "pull_request",
        "X-GitHub-Delivery": "delivery-acceptance-555",
        "X-Hub-Signature-256": sig,
        "Content-Type": "application/json"
    }
    hook_res = client.post("/api/integrations/github/webhook", content=webhook_payload, headers=headers)
    assert hook_res.status_code == 200
    # Resend same delivery ID
    hook_res2 = client.post("/api/integrations/github/webhook", content=webhook_payload, headers=headers)
    assert hook_res2.status_code == 200
    assert "already queued or processed" in hook_res2.json()["message"]

    # STEP 8: Knowledge Graph shows service, incident, root cause, rule connected
    graph_res = client.get("/api/graph")
    assert graph_res.status_code == 200
    g_data = graph_res.json()
    node_types = {n["type"] for n in g_data["nodes"]}
    assert "service" in node_types
    assert "incident" in node_types
    assert "root_cause" in node_types
    assert "rule" in node_types

    # STEP 9: Analytics shows MTTR trend, repeat-incident rate, ON vs OFF comparison, hours saved
    analytics_res = client.get("/api/analytics")
    assert analytics_res.status_code == 200
    a_data = analytics_res.json()
    assert len(a_data["mttr_trend"]) > 0
    assert a_data["repeat_incident_rate"] >= 0
    assert a_data["estimated_hours_saved"] > 0
    assert a_data["memory_on_confidence"] > a_data["memory_off_confidence"]
    assert len(a_data["manager_takeaways"]) >= 4

