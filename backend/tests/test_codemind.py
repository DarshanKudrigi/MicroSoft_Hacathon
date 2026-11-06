from __future__ import annotations
import pytest
from unittest.mock import patch, AsyncMock
from app.models import Review, ReviewComment, RejectedPattern, LearningEvent, CommentStatus

def test_codemind_review_diff(client):
    diff_payload = {
        "filename": "services/payments/webhook.py",
        "service": "payments",
        "diff": (
            "@@ -85,6 +85,8 @@ def handle_event():\n"
            "+    conn = pool.get_connection()\n"
            "+    cursor = conn.cursor()\n"
            "+    cursor.execute('INSERT INTO log VALUES (%s)', ['test'])\n"
            "     return True"
        ),
        "memory_enabled": True
    }

    mock_recalled = [
        {
            "id": "mem_rule_12",
            "text": "Review rule from Incident #12: Always close DB connections in webhook error paths",
            "tags": ["agent:codemind", "derived:true"],
            "confidence": 0.95
        }
    ]

    with patch("app.memory.HindsightMemoryService.is_available", return_value=True):
        with patch("app.memory.HindsightMemoryService.recall", new_callable=AsyncMock) as mock_recall:
            mock_recall.return_value = mock_recalled

            res = client.post("/api/codemind/review", json=diff_payload)
            assert res.status_code == 200
            data = res.json()
            assert data["filename"] == "services/payments/webhook.py"
            assert data["service"] == "payments"
            assert len(data["comments"]) >= 1
            comment = data["comments"][0]
            assert comment["severity"] in ("warning", "critical", "info")
            assert comment["fingerprint"] is not None

def test_codemind_feedback_and_rejected_pattern_filtering(client, db_session):
    # 1. Create a review and comment in DB
    rev = Review(
        filename="services/payments/test.py",
        service="payments",
        diff="+ conn = pool.get()",
        summary="Test review",
        memory_enabled=True
    )
    db_session.add(rev)
    db_session.commit()

    from app.codemind import compute_comment_fingerprint
    fp = compute_comment_fingerprint("payments", "Unreleased connection in test handler", None)

    comment = ReviewComment(
        review_id=rev.id,
        line=86,
        severity="warning",
        issue="Unreleased connection in test handler",
        suggestion="Wrap in with statement",
        because="Incident #12 rule",
        memory_id=None,
        status=CommentStatus.open,
        fingerprint=fp
    )
    db_session.add(comment)
    db_session.commit()
    comment_id = comment.id

    # 2. Reject the comment via feedback endpoint
    feedback_res = client.post(f"/api/codemind/comments/{comment_id}/feedback", json={"accepted": False})
    assert feedback_res.status_code == 200
    data = feedback_res.json()
    assert data["status"] == "rejected"

    # Verify added to rejected_patterns table
    rej = db_session.query(RejectedPattern).filter(
        RejectedPattern.fingerprint == comment.fingerprint
    ).first()
    assert rej is not None

    # Verify learning event was created
    event = db_session.query(LearningEvent).filter(
        LearningEvent.type == "pattern_rejected"
    ).first()
    assert event is not None

    # 3. Rerun review with the exact same issue: it must be filtered out!
    with patch("app.llm.LLMService.generate_structured") as mock_gen:
        # LLM emits the same comment that was just rejected
        from app.schemas import DiffSummary
        from app.codemind import ReviewCommentsResponseWrapper, ReviewCommentItem

        async def fake_generate(schema, *args, **kwargs):
            if schema == DiffSummary:
                return DiffSummary(service="payments", summary="test", riskyAreas=[], searchQuery="test")
            elif schema == ReviewCommentsResponseWrapper:
                return ReviewCommentsResponseWrapper(comments=[
                    ReviewCommentItem(
                        line=86,
                        severity="warning",
                        issue="Unreleased connection in test handler",
                        suggestion="Wrap in with statement",
                        because="Incident #12 rule",
                        memoryId=None
                    )
                ])
            raise RuntimeError(f"Unexpected schema {schema}")

        mock_gen.side_effect = fake_generate

        res2 = client.post("/api/codemind/review", json={
            "filename": "services/payments/test.py",
            "service": "payments",
            "diff": "@@ -85,2 +85,2 @@\n+ conn = pool.get()",
            "memory_enabled": True
        })
        assert res2.status_code == 200
        data2 = res2.json()
        # The comment was dropped by deterministic rejected-pattern filtering!
        assert len(data2["comments"]) == 0
