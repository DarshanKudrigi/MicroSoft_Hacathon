from __future__ import annotations
import os
import uuid
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
import httpx
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import MemoryRecall

logger = logging.getLogger("nexus.memory")

class HindsightMemoryService:
    def __init__(self):
        self.settings = get_settings()
        self._hindsight_client = None
        self._init_native_client()

    def _init_native_client(self):
        """Attempts to initialize native hindsight-client if Python runtime >= 3.10 and installed."""
        try:
            from hindsight_client import Hindsight
            if self.settings.HINDSIGHT_API_KEY:
                self._hindsight_client = Hindsight(
                    base_url=self.settings.HINDSIGHT_BASE_URL,
                    api_key=self.settings.HINDSIGHT_API_KEY
                )
                logger.info("Native hindsight_client successfully initialized.")
        except ImportError:
            # Fallback to direct typed HTTP client via httpx (guarantees runtime resilience)
            self._hindsight_client = None

    def is_available(self) -> bool:
        """Returns True if Hindsight credentials are configured and reachable."""
        return bool(self.settings.HINDSIGHT_API_KEY)

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.settings.HINDSIGHT_API_KEY}",
            "Content-Type": "application/json",
            "X-API-Key": self.settings.HINDSIGHT_API_KEY
        }

    def _get_base_url(self) -> str:
        base = self.settings.HINDSIGHT_BASE_URL.rstrip("/")
        if not base.endswith("/v1"):
            base = f"{base}/v1"
        return base

    async def retain(
        self,
        content: str,
        tags: List[str],
        timestamp: Optional[datetime] = None,
        async_mode: bool = False
    ) -> str:
        """
        Retains content in Hindsight memory bank with tags and timestamp.
        Returns the memory ID.
        Default async_mode=False ensures synchronous ingestion so memory is immediately recallable.
        """
        if not self.is_available():
            logger.warning("Hindsight is unavailable; returning synthetic memory ID for offline/dry-run mode.")
            return f"mem_local_{uuid.uuid4().hex[:12]}"

        # Try native client if available
        if self._hindsight_client and hasattr(self._hindsight_client, "retain"):
            try:
                res = self._hindsight_client.retain(
                    bank_id=self.settings.HINDSIGHT_BANK_ID,
                    content=content,
                    timestamp=timestamp.isoformat() if timestamp else None,
                    tags=tags,
                    async_mode=async_mode
                )
                if hasattr(res, "id"):
                    return str(res.id)
                elif isinstance(res, dict) and "id" in res:
                    return str(res["id"])
            except Exception as e:
                logger.warning(f"Native client retain failed, falling back to REST: {e}")

        # Direct REST API call
        url = f"{self._get_base_url()}/default/banks/{self.settings.HINDSIGHT_BANK_ID}/memories"
        payload = {
            "content": content,
            "tags": tags,
            "async": async_mode
        }
        if timestamp:
            payload["timestamp"] = timestamp.isoformat()

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, headers=self._get_headers(), json=payload)
                if res.status_code in (200, 201):
                    data = res.json()
                    return data.get("id") or data.get("memory_id") or f"mem_{uuid.uuid4().hex[:12]}"
                else:
                    logger.warning(f"Hindsight retain REST call returned {res.status_code}: {res.text}")
                    return f"mem_fallback_{uuid.uuid4().hex[:12]}"
        except Exception as e:
            logger.error(f"Error calling Hindsight retain: {e}")
            return f"mem_err_{uuid.uuid4().hex[:12]}"

    async def recall(
        self,
        query: str,
        tags: Optional[List[str]] = None,
        tags_match: str = "all",
        limit: int = 5,
        db: Optional[Session] = None
    ) -> List[Dict[str, Any]]:
        """
        Recalls top relevant memories from Hindsight.
        Optionally records recall counts into Postgres memory_recalls table.
        """
        if not self.is_available():
            logger.info("Hindsight is unavailable; recall returning empty list.")
            return []

        results: List[Dict[str, Any]] = []

        # Try native client
        if self._hindsight_client and hasattr(self._hindsight_client, "recall"):
            try:
                raw_results = self._hindsight_client.recall(
                    bank_id=self.settings.HINDSIGHT_BANK_ID,
                    query=query,
                    tags=tags or [],
                    tags_match=tags_match,
                    max_results=limit
                )
                if isinstance(raw_results, list):
                    for item in raw_results:
                        if hasattr(item, "id") and hasattr(item, "text"):
                            results.append({
                                "id": str(item.id),
                                "text": item.text,
                                "tags": getattr(item, "tags", []),
                                "confidence": getattr(item, "score", 0.9)
                            })
                        elif isinstance(item, dict):
                            results.append(item)
            except Exception as e:
                logger.warning(f"Native client recall failed, trying REST: {e}")

        # If native client didn't produce results, call REST
        if not results:
            url = f"{self._get_base_url()}/default/banks/{self.settings.HINDSIGHT_BANK_ID}/recall"
            payload = {
                "query": query,
                "tags": tags or [],
                "tags_match": tags_match,
                "max_results": limit
            }
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.post(url, headers=self._get_headers(), json=payload)
                    if res.status_code == 200:
                        data = res.json()
                        items = data.get("results") or data.get("memories") or data
                        if isinstance(items, list):
                            for it in items:
                                if isinstance(it, dict):
                                    results.append({
                                        "id": it.get("id") or str(uuid.uuid4().hex[:8]),
                                        "text": it.get("text") or it.get("content") or "",
                                        "tags": it.get("tags") or [],
                                        "confidence": it.get("score") or it.get("confidence") or 0.85
                                    })
            except Exception as e:
                logger.error(f"Error calling Hindsight recall REST: {e}")

        # Update recall counters in Postgres if DB session provided
        if db and results:
            now = datetime.utcnow()
            for r in results:
                mem_id = r.get("id")
                if mem_id:
                    try:
                        record = db.query(MemoryRecall).filter(MemoryRecall.memory_id == mem_id).first()
                        if record:
                            record.count += 1
                            record.last_recalled_at = now
                        else:
                            new_recall = MemoryRecall(memory_id=mem_id, count=1, last_recalled_at=now)
                            db.add(new_recall)
                        db.commit()
                    except Exception as db_err:
                        db.rollback()
                        logger.warning(f"Could not update memory_recalls table for {mem_id}: {db_err}")

        return results

    async def reflect(self, query: str) -> str:
        """Triggers higher-level cognitive reflection across memories."""
        if not self.is_available():
            return "Hindsight memory reflection is offline."

        # Native client
        if self._hindsight_client and hasattr(self._hindsight_client, "reflect"):
            try:
                res = self._hindsight_client.reflect(
                    bank_id=self.settings.HINDSIGHT_BANK_ID,
                    query=query
                )
                if hasattr(res, "text"):
                    return str(res.text)
                elif isinstance(res, str):
                    return res
            except Exception as e:
                logger.warning(f"Native reflect failed: {e}")

        url = f"{self._get_base_url()}/default/banks/{self.settings.HINDSIGHT_BANK_ID}/reflect"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, headers=self._get_headers(), json={"query": query})
                if res.status_code == 200:
                    data = res.json()
                    return data.get("reflection") or data.get("text") or str(data)
                return f"Reflect returned status {res.status_code}"
        except Exception as e:
            logger.error(f"Error calling Hindsight reflect: {e}")
            return f"Reflect error: {e}"

    async def get_by_id(self, memory_id: str) -> Optional[Dict[str, Any]]:
        """Fetches a specific memory unit by its unique identifier."""
        if not self.is_available() or not memory_id:
            return None

        url = f"{self._get_base_url()}/default/banks/{self.settings.HINDSIGHT_BANK_ID}/memories/{memory_id}"
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(url, headers=self._get_headers())
                if res.status_code == 200:
                    data = res.json()
                    return {
                        "id": data.get("id", memory_id),
                        "text": data.get("text") or data.get("content") or "",
                        "tags": data.get("tags") or [],
                        "created_at": data.get("created_at")
                    }
        except Exception as e:
            logger.warning(f"Error fetching memory {memory_id}: {e}")
        return None

_memory_service: Optional[HindsightMemoryService] = None

def get_memory_service() -> HindsightMemoryService:
    global _memory_service
    if _memory_service is None:
        _memory_service = HindsightMemoryService()
    return _memory_service

