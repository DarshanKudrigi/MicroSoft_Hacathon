from __future__ import annotations
import os
import yaml
import json
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Request, Header, HTTPException, status, Depends
from sqlalchemy.orm import Session

from app.main import get_db
from app.config import get_settings
from app.models import Job, JobStatus, PullRequest, GraphNode, GraphEdge
from app.security import verify_github_signature, verify_gitlab_token

logger = logging.getLogger("nexus.integrations")

router = APIRouter(prefix="/api/integrations", tags=["integrations"])

# Load service map from YAML
def load_service_map() -> Dict[str, List[str]]:
    paths = [
        "service_map.yaml",
        "/app/service_map.yaml",
        os.path.join(os.path.dirname(__file__), "..", "..", "service_map.yaml")
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                    mapping = {}
                    for s_name, s_info in data.get("services", {}).items():
                        mapping[s_name] = s_info.get("paths", [])
                    return mapping
            except Exception as e:
                logger.warning(f"Error reading service map from {p}: {e}")
    # Default fallback
    return {
        "payments": ["services/payments/", "payment"],
        "auth": ["services/auth/", "auth"],
        "orders": ["services/orders/", "order"]
    }

def map_path_to_service(filepath: str) -> str:
    """Maps a changed file path to a known service using service_map.yaml."""
    s_map = load_service_map()
    lower_path = filepath.lower()
    for service, patterns in s_map.items():
        for pat in patterns:
            if pat.lower() in lower_path:
                return service
    return "payments" # Default fallback domain

# Ignored files for PR reviews
IGNORED_EXTENSIONS = (
    ".lock", "-lock.json", ".min.js", ".min.css", ".map", ".png", ".jpg", ".jpeg",
    ".gif", ".ico", ".svg", ".woff", ".woff2", ".ttf", ".pdf", ".zip", ".tar.gz"
)

def should_skip_file(filename: str) -> bool:
    lower = filename.lower()
    return any(lower.endswith(ext) for ext in IGNORED_EXTENSIONS)

@router.post("/github/webhook")
async def github_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_github_event: Optional[str] = Header(None, alias="X-GitHub-Event"),
    x_github_delivery: Optional[str] = Header(None, alias="X-GitHub-Delivery"),
    x_hub_signature_256: Optional[str] = Header(None, alias="X-Hub-Signature-256")
):
    """
    GitHub Webhook Handler:
    - Verifies HMAC-SHA256 signature on raw request body.
    - Uses X-GitHub-Delivery for idempotent deduplication.
    - Enqueues job in jobs table and returns 200 fast.
    """
    raw_body = await request.body()

    # 1. Verify Signature on RAW body
    if not verify_github_signature(raw_body, x_hub_signature_256):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "INVALID_SIGNATURE", "message": "GitHub HMAC signature verification failed"}}
        )

    # 2. Parse JSON payload
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "INVALID_JSON", "message": "Malformed JSON payload"}}
        )

    dedupe_key = f"github:{x_github_delivery or payload.get('after') or datetime.utcnow().isoformat()}"

    # 3. Check for existing job (idempotent)
    existing_job = db.query(Job).filter(Job.dedupe_key == dedupe_key).first()
    if existing_job:
        logger.info(f"Deduplicated GitHub delivery: {dedupe_key}")
        return {"status": "ok", "message": "Event already queued or processed", "job_id": existing_job.id}

    # 4. Enqueue Job
    job_type = f"github:{x_github_event or 'unknown'}"
    new_job = Job(
        type=job_type,
        payload=payload,
        status=JobStatus.queued,
        dedupe_key=dedupe_key,
        created_at=datetime.utcnow()
    )
    db.add(new_job)
    db.commit()
    db.refresh(new_job)

    # Process job synchronously or via worker (in dry-run mode, process immediately for instant response)
    from app.jobs import process_job
    await process_job(new_job.id, db)

    return {"status": "ok", "message": "Webhook received and enqueued", "job_id": new_job.id}

@router.post("/gitlab/webhook")
async def gitlab_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_gitlab_event: Optional[str] = Header(None, alias="X-Gitlab-Event"),
    x_gitlab_event_uuid: Optional[str] = Header(None, alias="X-Gitlab-Event-UUID"),
    x_gitlab_token: Optional[str] = Header(None, alias="X-Gitlab-Token")
):
    """
    GitLab Webhook Handler:
    - Verifies secret token header using constant-time comparison.
    - Uses X-Gitlab-Event-UUID for idempotent deduplication.
    - Enqueues job in jobs table and returns 200 fast.
    """
    raw_body = await request.body()

    # 1. Verify Token
    if not verify_gitlab_token(x_gitlab_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "INVALID_TOKEN", "message": "GitLab secret token verification failed"}}
        )

    # 2. Parse JSON
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "INVALID_JSON", "message": "Malformed JSON payload"}}
        )

    dedupe_key = f"gitlab:{x_gitlab_event_uuid or datetime.utcnow().isoformat()}"

    # 3. Check for existing job (idempotent)
    existing_job = db.query(Job).filter(Job.dedupe_key == dedupe_key).first()
    if existing_job:
        return {"status": "ok", "message": "Event already queued", "job_id": existing_job.id}

    # 4. Enqueue Job
    job_type = f"gitlab:{x_gitlab_event or 'unknown'}"
    new_job = Job(
        type=job_type,
        payload=payload,
        status=JobStatus.queued,
        dedupe_key=dedupe_key,
        created_at=datetime.utcnow()
    )
    db.add(new_job)
    db.commit()
    db.refresh(new_job)

    from app.jobs import process_job
    await process_job(new_job.id, db)

    return {"status": "ok", "message": "GitLab webhook received and enqueued", "job_id": new_job.id}

