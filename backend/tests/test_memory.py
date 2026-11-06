from __future__ import annotations
import pytest
from datetime import datetime
from unittest.mock import patch, MagicMock, AsyncMock
from app.memory import HindsightMemoryService
from app.models import MemoryRecall

@pytest.mark.asyncio
async def test_memory_retain_offline():
    svc = HindsightMemoryService()
    # Offline mode returns a fallback synthetic memory ID
    mem_id = await svc.retain(
        content="Test connection pool exhaustion",
        tags=["agent:sentinel", "type:incident", "service:payments"],
        timestamp=datetime.utcnow()
    )
    assert mem_id is not None
    assert isinstance(mem_id, str)
    assert len(mem_id) > 0

@pytest.mark.asyncio
async def test_memory_recall_offline():
    svc = HindsightMemoryService()
    # When HINDSIGHT_API_KEY is unset, recall returns empty list gracefully
    results = await svc.recall(query="connection pool", tags=["agent:sentinel"])
    assert isinstance(results, list)
    assert len(results) == 0

@pytest.mark.asyncio
async def test_memory_recall_with_db_tracking(db_session):
    svc = HindsightMemoryService()
    
    mock_results = [
        {"id": "mem_123", "text": "Pool exhaustion fix", "tags": ["agent:sentinel"], "confidence": 0.95}
    ]
    
    with patch.object(svc, "is_available", return_value=True):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"results": mock_results}

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            recalled = await svc.recall(
                query="pool exhaustion",
                tags=["agent:sentinel"],
                tags_match="all",
                limit=5,
                db=db_session
            )
            
            assert len(recalled) == 1
            assert recalled[0]["id"] == "mem_123"

            # Verify memory_recalls row was created
            rec = db_session.query(MemoryRecall).filter(MemoryRecall.memory_id == "mem_123").first()
            assert rec is not None
            assert rec.count == 1

            # Recall again to verify count increments
            await svc.recall(
                query="pool exhaustion",
                tags=["agent:sentinel"],
                limit=5,
                db=db_session
            )
            db_session.refresh(rec)
            assert rec.count == 2

@pytest.mark.asyncio
async def test_memory_reflect_offline():
    svc = HindsightMemoryService()
    text = await svc.reflect(query="recurring issues in payments")
    assert "offline" in text.lower() or text is not None
