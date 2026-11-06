from __future__ import annotations
import hmac
import hashlib
import json
import pytest
from app.models import Job, PullRequest, GraphNode, GraphEdge

def test_github_webhook_invalid_signature(client):
    payload = json.dumps({"action": "opened", "pull_request": {"number": 101}}).encode("utf-8")
    headers = {
        "X-GitHub-Event": "pull_request",
        "X-GitHub-Delivery": "delivery-12345",
        "X-Hub-Signature-256": "sha256=invalidhash"
    }
    res = client.post("/api/integrations/github/webhook", content=payload, headers=headers)
    assert res.status_code == 401

def test_github_webhook_pr_opened_and_deduplication(client, db_session):
    secret = "test-github-secret"
    payload_dict = {
        "action": "opened",
        "pull_request": {
            "number": 201,
            "title": "Add payment retry logic",
            "user": {"login": "sarah_dev"},
            "html_url": "https://github.com/nexus-org/payments/pull/201"
        },
        "repository": {"full_name": "nexus-org/payments-service"},
        "diff": (
            "diff --git a/services/payments/retry.py b/services/payments/retry.py\n"
            "--- a/services/payments/retry.py\n"
            "+++ b/services/payments/retry.py\n"
            "@@ -10,3 +10,4 @@ def retry():\n"
            "+    conn = pool.get_connection()\n"
        )
    }
    payload_bytes = json.dumps(payload_dict).encode("utf-8")
    mac = hmac.new(secret.encode("utf-8"), msg=payload_bytes, digestmod=hashlib.sha256)
    valid_sig = f"sha256={mac.hexdigest()}"

    headers = {
        "X-GitHub-Event": "pull_request",
        "X-GitHub-Delivery": "delivery-pr-201",
        "X-Hub-Signature-256": valid_sig,
        "Content-Type": "application/json"
    }

    # 1. First send: processes and completes
    res = client.post("/api/integrations/github/webhook", content=payload_bytes, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"

    # Verify job created in DB
    job = db_session.query(Job).filter(Job.dedupe_key == "github:delivery-pr-201").first()
    assert job is not None
    assert job.status.value in ("done", "running", "queued")

    # 2. Resend exact same delivery ID: deduplicated without re-execution
    res_duplicate = client.post("/api/integrations/github/webhook", content=payload_bytes, headers=headers)
    assert res_duplicate.status_code == 200
    assert "already queued or processed" in res_duplicate.json()["message"]

def test_github_webhook_pr_merged_updates_graph(client, db_session):
    secret = "test-github-secret"
    payload_dict = {
        "action": "closed",
        "pull_request": {
            "number": 305,
            "title": "Refactor HikariCP connection pool settings",
            "user": {"login": "alex_lead"},
            "html_url": "https://github.com/nexus-org/payments/pull/305",
            "merged": True,
            "merged_at": "2026-11-06T18:00:00Z",
            "head": {"sha": "deadbeef9999"}
        },
        "repository": {"full_name": "nexus-org/payments-service"},
        "files": ["services/payments/pool_config.yaml"]
    }
    payload_bytes = json.dumps(payload_dict).encode("utf-8")
    mac = hmac.new(secret.encode("utf-8"), msg=payload_bytes, digestmod=hashlib.sha256)
    valid_sig = f"sha256={mac.hexdigest()}"

    headers = {
        "X-GitHub-Event": "pull_request",
        "X-GitHub-Delivery": "delivery-merge-305",
        "X-Hub-Signature-256": valid_sig,
        "Content-Type": "application/json"
    }

    res = client.post("/api/integrations/github/webhook", content=payload_bytes, headers=headers)
    assert res.status_code == 200

    # Verify PR record saved in pull_requests table
    pr = db_session.query(PullRequest).filter(PullRequest.number == 305).first()
    assert pr is not None
    assert pr.state == "merged"
    assert pr.author == "alex_lead"

    # Verify Knowledge Graph node and touches edge
    node = db_session.query(GraphNode).filter(GraphNode.id == "node:pr:305").first()
    assert node is not None
    assert node.type == "pr"

    edge = db_session.query(GraphEdge).filter(
        GraphEdge.src == "node:pr:305",
        GraphEdge.type == "touches"
    ).first()
    assert edge is not None

def test_gitlab_webhook(client, db_session):
    headers = {
        "X-Gitlab-Event": "Merge Request Hook",
        "X-Gitlab-Event-UUID": "gitlab-uuid-999",
        "X-Gitlab-Token": "test-gitlab-secret",
        "Content-Type": "application/json"
    }
    payload = {
        "object_kind": "merge_request",
        "pull_request": {"number": 401, "title": "GitLab MR test"}
    }
    res = client.post("/api/integrations/gitlab/webhook", json=payload, headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

