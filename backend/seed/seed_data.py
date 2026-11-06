from __future__ import annotations
import os
import sys
import logging
from datetime import datetime, timedelta, date
from typing import Dict, Any, List

# Ensure app package is importable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.orm import Session
from sqlalchemy import text

from app.models import (
    Base, Incident, IncidentStep, Review, ReviewComment, RejectedPattern,
    LearningEvent, MetricDaily, MemoryRecall, Integration, PullRequest,
    Job, GraphNode, GraphEdge, RootCauseCategory, StepKind, CommentStatus
)
from app.memory import get_memory_service

logger = logging.getLogger("nexus.seed")

# 5 Repeating Root Cause Categories
CATEGORIES = [
    RootCauseCategory.connection_pool,
    RootCauseCategory.oom,
    RootCauseCategory.bad_config,
    RootCauseCategory.slow_query,
    RootCauseCategory.thread_starvation,
]

SERVICES = ["payments", "auth", "orders"]

async def run_seed(db: Session) -> Dict[str, Any]:
    """
    Idempotent seed script:
    - Clears existing data cleanly
    - Inserts 40 incidents across 3 services with trending MTTR
    - Enforces Incident #12 as the canonical HikariCP connection pool outage
    - Inserts PRs, review rules, daily metrics, and Knowledge Graph nodes/edges
    - Backdates Hindsight memories
    - Resets PostgreSQL identity sequences
    """
    logger.info("Starting Nexus AI idempotent database seeding...")
    memory_service = get_memory_service()

    # Clear existing tables in correct FK dependency order
    db.query(GraphEdge).delete()
    db.query(GraphNode).delete()
    db.query(Job).delete()
    db.query(PullRequest).delete()
    db.query(Integration).delete()
    db.query(MemoryRecall).delete()
    db.query(MetricDaily).delete()
    db.query(LearningEvent).delete()
    db.query(RejectedPattern).delete()
    db.query(ReviewComment).delete()
    db.query(Review).delete()
    db.query(IncidentStep).delete()
    db.query(Incident).delete()
    db.commit()

    base_time = datetime.utcnow() - timedelta(days=40)

    # 1. Seed 40 Incidents
    created_incidents: List[Incident] = []
    
    for i in range(1, 41):
        cat_idx = (i - 1) % len(CATEGORIES)
        category = CATEGORIES[cat_idx]
        service = SERVICES[(i - 1) % len(SERVICES)]
        incident_time = base_time + timedelta(days=i * 0.95, hours=(i % 12))

        # MTTR trends downwards over time from ~110 minutes down to ~15 minutes
        # with occasional variation
        mttr_trend = max(14, int(110 - (i * 2.3) + ((i % 5) * 4)))

        if i == 12:
            # Canonical Incident #12: Connection Pool Exhaustion in Payments
            service = "payments"
            category = RootCauseCategory.connection_pool
            mttr_trend = 25
            logs = (
                "2026-10-18T14:22:01.402Z [payments-worker-3] ERROR com.zaxxer.hikari.HikariPool - "
                "HikariPool-1 - Connection is not available, request timed out after 30005ms.\n"
                "org.postgresql.util.PSQLException: FATAL: remaining connection slots are reserved for non-replication superuser connections\n"
                "    at com.nexus.payments.checkout.ProcessPayment(CheckoutService.java:142)\n"
                "    at com.nexus.payments.webhook.StripeWebhookHandler.handleEvent(StripeWebhookHandler.java:88)\n"
                "    at org.springframework.web.servlet.FrameworkServlet.service(FrameworkServlet.java:883)\n"
                "Caused by: Connection leak in StripeWebhookHandler: connection acquired at line 88 was never released during error response handling\n"
                "2026-10-18T14:22:05.112Z [payments-worker-7] WARN com.zaxxer.hikari.pool.PoolBase - "
                "HikariPool-1 - Failed to validate connection org.postgresql.jdbc.PgConnection@4d2a1f8 (connection dead)"
            )
            root_cause = (
                "StripeWebhookHandler failed to release DB connections when Stripe returned HTTP 400/500, "
                "exhausting HikariCP pool of max 10 connections under high webhook traffic."
            )
            confidence = 0.96
        else:
            if category == RootCauseCategory.connection_pool:
                logs = (
                    f"2026-10-{10 + (i%20):02d}T09:15:00Z [{service}-srv] ERROR HikariPool - Connection request timeout after 30000ms.\n"
                    f"Active: 10, Idle: 0, Waiting: 84. Database connection pool starved under load in {service}."
                )
                root_cause = f"Database connection pool exhausted under concurrent traffic in {service}; connections unclosed in error paths."
            elif category == RootCauseCategory.oom:
                logs = (
                    f"2026-10-{10 + (i%20):02d}T11:20:00Z [{service}-srv] ERROR java.lang.OutOfMemoryError: Java heap space\n"
                    f"Dumping heap to java_pid{1000 + i}.hprof ... Heap exhausted processing bulk export payload."
                )
                root_cause = f"Out of memory error in {service}: unbounded in-memory collection during batch export."
            elif category == RootCauseCategory.bad_config:
                logs = (
                    f"2026-10-{10 + (i%20):02d}T13:45:00Z [{service}-srv] FATAL ConfigurationException: "
                    f"Invalid environment variable DB_SSL_MODE='require' mismatched with internal self-signed cert on port 5432."
                )
                root_cause = f"Misconfigured deployment environment parameter DB_SSL_MODE causing handshake failure in {service}."
            elif category == RootCauseCategory.slow_query:
                logs = (
                    f"2026-10-{10 + (i%20):02d}T16:05:00Z [{service}-srv] WARN SlowQuery: query execution 8420ms > threshold 500ms.\n"
                    f"SELECT * FROM {service}_audit_events WHERE user_id = $1 ORDER BY created_at DESC (Seq Scan on 4.2M rows)."
                )
                root_cause = f"Full sequential table scan on {service}_audit_events due to missing composite index on (user_id, created_at)."
            else: # thread_starvation
                logs = (
                    f"2026-10-{10 + (i%20):02d}T18:30:00Z [{service}-srv] ERROR ThreadStarvation: "
                    f"All 200 worker threads blocked in waiting state. Unbounded synchronous HTTP calls in async event loop."
                )
                root_cause = f"Synchronous blocking HTTP call inside asynchronous worker pool in {service} starving request threads."

            confidence = round(0.70 + ((i % 10) * 0.025), 2)

        # Retain memory
        memory_content = (
            f"{service}, {incident_time.strftime('%Y-%m-%d')}: {logs.splitlines()[0]}. "
            f"Root cause: {root_cause} Fix: Pool size adjusted, connections closed in finally block. "
            f"Resolved in {mttr_trend} min (Incident #{i})."
        )
        mem_tags = [
            "agent:sentinel",
            "type:incident",
            f"service:{service}",
            f"source:incident-{i}"
        ]
        mem_id = await memory_service.retain(
            content=memory_content,
            tags=mem_tags,
            timestamp=incident_time,
            async_mode=False
        )

        inc = Incident(
            id=i,
            service=service,
            logs=logs,
            root_cause=root_cause,
            root_cause_category=category,
            confidence=confidence,
            status="resolved",
            minutes_to_resolve=mttr_trend,
            memory_enabled=True,
            memory_id=mem_id,
            created_at=incident_time,
            resolved_at=incident_time + timedelta(minutes=mttr_trend)
        )
        db.add(inc)
        created_incidents.append(inc)

        # Add steps for each incident
        if i == 12:
            step1 = IncidentStep(incident_id=12, kind=StepKind.verify, position=1, text="Check HikariCP active connections via /actuator/metrics/hikaricp.connections.active")
            step2 = IncidentStep(incident_id=12, kind=StepKind.verify, position=2, text="Inspect PostgreSQL pg_stat_activity for unreleased idle in transaction connections")
            step3 = IncidentStep(incident_id=12, kind=StepKind.fix, position=1, text="Enclose StripeWebhookHandler connection handling in try-with-resources block")
            step4 = IncidentStep(incident_id=12, kind=StepKind.fix, position=2, text="Increase HikariCP maximumPoolSize from 10 to 30 and leakDetectionThreshold to 5000ms")
            db.add_all([step1, step2, step3, step4])
        else:
            step1 = IncidentStep(incident_id=i, kind=StepKind.verify, position=1, text=f"Verify {service} telemetry and error rates on Grafana")
            step2 = IncidentStep(incident_id=i, kind=StepKind.fix, position=1, text=f"Apply remediation patch and reload {service} worker instances")
            db.add_all([step1, step2])

    db.commit()

    # 2. Seed Derived Rules and Review Comments linked to Incident #12 & others
    rule_mem_content = (
        "Review rule from Incident #12: In payments webhook handlers, always wrap database connections "
        "in try-with-resources or explicit finally blocks to prevent HikariCP connection starvation under load. "
        "Reject any raw connection checkout without guaranteed release."
    )
    rule_tags = [
        "agent:codemind",
        "derived:true",
        "source:incident-12",
        "type:rule",
        "service:payments"
    ]
    rule_mem_id = await memory_service.retain(
        content=rule_mem_content,
        tags=rule_tags,
        timestamp=base_time + timedelta(days=13),
        async_mode=False
    )

    # Learning event for Incident #12 rule
    le = LearningEvent(
        type="rule_created",
        source_incident_id=12,
        memory_id=rule_mem_id,
        detail="Rule created for CodeMind: Enforce try-with-resources on webhook DB connections (from Incident #12)",
        created_at=base_time + timedelta(days=13)
    )
    db.add(le)

    # 3. Seed Sample Reviews & Comments
    sample_reviews = [
        Review(
            id=1,
            filename="services/payments/webhook.py",
            service="payments",
            diff=(
                "@@ -85,6 +85,8 @@ def handle_stripe_event(event):\n"
                "+    conn = pool.get_connection()\n"
                "+    cursor = conn.cursor()\n"
                "+    cursor.execute('INSERT INTO webhook_events VALUES (%s)', [event.id])\n"
                "+    # Missing conn.close() in exception branch\n"
                "     return {'status': 'processed'}"
            ),
            summary="Add webhook processing without connection release",
            memory_enabled=True,
            pr_id=101,
            provider="github",
            created_at=base_time + timedelta(days=15)
        ),
        Review(
            id=2,
            filename="services/auth/session.py",
            service="auth",
            diff=(
                "@@ -40,4 +40,5 @@ def get_user_session(user_id):\n"
                "+    # Full table scan on user_sessions without index\n"
                "+    return db.query('SELECT * FROM user_sessions WHERE user_id = %s', user_id)\n"
            ),
            summary="Query session table without index",
            memory_enabled=True,
            pr_id=102,
            provider="github",
            created_at=base_time + timedelta(days=18)
        )
    ]
    db.add_all(sample_reviews)
    db.commit()

    sample_comments = [
        ReviewComment(
            id=1,
            review_id=1,
            line=86,
            severity="critical",
            issue="Database connection checked out from pool is never released on error paths.",
            suggestion="Use with pool.get_connection() as conn: context manager to ensure immediate connection return.",
            because=f"Review rule from Incident #12: unreleased connections in payments caused HikariCP exhaustion outage.",
            memory_id=rule_mem_id,
            status=CommentStatus.accepted,
            fingerprint="payments:conn_unreleased:line_86",
            created_at=base_time + timedelta(days=15)
        ),
        ReviewComment(
            id=2,
            review_id=2,
            line=42,
            severity="warning",
            issue="Sequential scan on user_sessions table will degrade auth throughput.",
            suggestion="Add index idx_user_sessions_user_id or use cached session store.",
            because="General best practice and past slow query incident in auth.",
            memory_id=None,
            status=CommentStatus.accepted,
            fingerprint="auth:missing_index:line_42",
            created_at=base_time + timedelta(days=18)
        )
    ]
    db.add_all(sample_comments)

    # 4. Seed Pull Requests
    sample_prs = [
        PullRequest(
            id=1,
            provider="github",
            number=101,
            repo="nexus-org/payments-service",
            title="Fix unreleased connection in StripeWebhookHandler",
            author="alex_dev",
            service="payments",
            files=["services/payments/webhook.py", "services/payments/config.yaml"],
            state="merged",
            merged_at=base_time + timedelta(days=16),
            url="https://github.com/nexus-org/payments-service/pull/101",
            head_sha="a1b2c3d4e5f67890",
            created_at=base_time + timedelta(days=15)
        ),
        PullRequest(
            id=2,
            provider="github",
            number=102,
            repo="nexus-org/auth-service",
            title="Optimize user session query and index",
            author="sam_eng",
            service="auth",
            files=["services/auth/session.py", "alembic/versions/004_add_session_index.py"],
            state="merged",
            merged_at=base_time + timedelta(days=19),
            url="https://github.com/nexus-org/auth-service/pull/102",
            head_sha="f6e5d4c3b2a10987",
            created_at=base_time + timedelta(days=18)
        ),
        PullRequest(
            id=3,
            provider="github",
            number=103,
            repo="nexus-org/orders-service",
            title="Configure JVM heap limit and cache expiry",
            author="priya_ops",
            service="orders",
            files=["services/orders/CacheManager.java"],
            state="open",
            merged_at=None,
            url="https://github.com/nexus-org/orders-service/pull/103",
            head_sha="1122334455667788",
            created_at=base_time + timedelta(days=25)
        )
    ]
    db.add_all(sample_prs)
    db.commit()

    # 5. Seed Knowledge Graph (graph_nodes and graph_edges)
    # Service Nodes
    for s in SERVICES:
        db.add(GraphNode(
            id=f"node:service:{s}",
            type="service",
            label=f"{s.capitalize()} Service",
            ref_id=s,
            meta={"description": f"Core {s} infrastructure"}
        ))

    # Root Cause Nodes
    for c in CATEGORIES:
        db.add(GraphNode(
            id=f"node:root_cause:{c.value}",
            type="root_cause",
            label=c.value.replace("_", " ").title(),
            ref_id=c.value,
            meta={"category": c.value}
        ))

    # Incident #12 Node
    db.add(GraphNode(
        id="node:incident:12",
        type="incident",
        label="Incident #12: HikariCP Exhaustion",
        ref_id="12",
        memory_id=created_incidents[11].memory_id,
        meta={"service": "payments", "mttr": 25, "category": "connection_pool"}
    ))

    # Other representative incident nodes
    for i in [1, 2, 3, 4, 5, 20, 35]:
        db.add(GraphNode(
            id=f"node:incident:{i}",
            type="incident",
            label=f"Incident #{i}: {created_incidents[i-1].root_cause_category.value}",
            ref_id=str(i),
            memory_id=created_incidents[i-1].memory_id,
            meta={"service": created_incidents[i-1].service, "mttr": created_incidents[i-1].minutes_to_resolve}
        ))

    # Rule Node for Incident #12
    db.add(GraphNode(
        id="node:rule:incident-12",
        type="rule",
        label="Rule: Close Webhook DB Connections",
        ref_id="incident-12",
        memory_id=rule_mem_id,
        meta={"source_incident": 12, "service": "payments"}
    ))

    # PR Node
    db.add(GraphNode(
        id="node:pr:101",
        type="pr",
        label="PR #101: Fix unreleased connection",
        ref_id="101",
        meta={"author": "alex_dev", "service": "payments"}
    ))

    # Comment Node
    db.add(GraphNode(
        id="node:comment:1",
        type="comment",
        label="Comment: Unreleased Connection (L86)",
        ref_id="1",
        meta={"severity": "critical", "status": "accepted"}
    ))
    db.commit()

    # Graph Edges
    # occurred_in (incident -> service)
    db.add(GraphEdge(
        id="edge:inc12:payments",
        src="node:incident:12",
        dst="node:service:payments",
        type="occurred_in"
    ))
    # caused_by (incident -> root_cause)
    db.add(GraphEdge(
        id="edge:inc12:conn_pool",
        src="node:incident:12",
        dst="node:root_cause:connection_pool",
        type="caused_by"
    ))
    # derived_rule (incident -> rule)
    db.add(GraphEdge(
        id="edge:inc12:rule",
        src="node:incident:12",
        dst="node:rule:incident-12",
        type="derived_rule"
    ))
    # cited_by (rule -> comment)
    db.add(GraphEdge(
        id="edge:rule:comment1",
        src="node:rule:incident-12",
        dst="node:comment:1",
        type="cited_by"
    ))
    # touches (pr -> service)
    db.add(GraphEdge(
        id="edge:pr101:payments",
        src="node:pr:101",
        dst="node:service:payments",
        type="touches"
    ))
    # repeat_of: between repeating connection pool incidents
    db.add(GraphEdge(
        id="edge:inc35:inc12:repeat",
        src="node:incident:35",
        dst="node:incident:12",
        type="repeat_of"
    ))

    # Edges for representative incidents
    for i in [1, 2, 3, 4, 5, 20]:
        inc_obj = created_incidents[i-1]
        db.add(GraphEdge(
            id=f"edge:inc{i}:{inc_obj.service}",
            src=f"node:incident:{i}",
            dst=f"node:service:{inc_obj.service}",
            type="occurred_in"
        ))
        db.add(GraphEdge(
            id=f"edge:inc{i}:{inc_obj.root_cause_category.value}",
            src=f"node:incident:{i}",
            dst=f"node:root_cause:{inc_obj.root_cause_category.value}",
            type="caused_by"
        ))

    db.commit()

    # 6. Seed Daily Metrics (Past 30 days)
    for day_offset in range(30, -1, -1):
        d = date.today() - timedelta(days=day_offset)
        # Average MTTR drops over the 30-day window
        base_mttr = 85.0 - (30 - day_offset) * 1.8
        for s in SERVICES:
            db.add(MetricDaily(
                date=d,
                service=s,
                incidents=max(1, (day_offset % 3)),
                avg_mttr=round(max(18.0, base_mttr + ((day_offset % 4) * 3)), 1),
                comments=max(2, (day_offset % 5)),
                accepted=max(1, (day_offset % 4)),
                repeat_incidents=max(0, 3 - int((30 - day_offset) / 8)), # drops over time
                rule_catches=min(6, int((30 - day_offset) / 5) + (day_offset % 2)) # rises over time
            ))
    db.commit()

    # 7. Reset sequences in PostgreSQL if applicable
    try:
        if db.bind.dialect.name == "postgresql":
            db.execute(text("SELECT setval(pg_get_serial_sequence('incidents', 'id'), coalesce(max(id), 1)) FROM incidents;"))
            db.execute(text("SELECT setval(pg_get_serial_sequence('incident_steps', 'id'), coalesce(max(id), 1)) FROM incident_steps;"))
            db.execute(text("SELECT setval(pg_get_serial_sequence('reviews', 'id'), coalesce(max(id), 1)) FROM reviews;"))
            db.execute(text("SELECT setval(pg_get_serial_sequence('review_comments', 'id'), coalesce(max(id), 1)) FROM review_comments;"))
            db.execute(text("SELECT setval(pg_get_serial_sequence('pull_requests', 'id'), coalesce(max(id), 1)) FROM pull_requests;"))
            db.execute(text("SELECT setval(pg_get_serial_sequence('learning_events', 'id'), coalesce(max(id), 1)) FROM learning_events;"))
            db.commit()
    except Exception as seq_err:
        logger.warning(f"Sequence reset skipped or failed: {seq_err}")

    logger.info("Database seeding successfully completed!")
    return {
        "incidents_seeded": 40,
        "incident_12_id": 12,
        "services": SERVICES,
        "reviews": len(sample_reviews),
        "comments": len(sample_comments),
        "pull_requests": len(sample_prs),
        "graph_nodes": db.query(GraphNode).count(),
        "graph_edges": db.query(GraphEdge).count(),
        "status": "success"
    }

if __name__ == "__main__":
    from app.main import SessionLocal
    import asyncio
    db_session = SessionLocal()
    try:
        result = asyncio.run(run_seed(db_session))
        print("Seed result:", result)
    finally:
        db_session.close()

