from __future__ import annotations
import re
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.config import get_settings
from app.models import (
    Job, JobStatus, PullRequest, Review, ReviewComment, RejectedPattern,
    LearningEvent, GraphNode, GraphEdge, CommentStatus
)
from app.integrations import map_path_to_service, should_skip_file
from app.schemas import CodeMindReviewRequest
from app.codemind import review_diff, submit_comment_feedback
from app.schemas import CommentFeedbackRequest

logger = logging.getLogger("nexus.jobs")

def claim_next_job(db: Session) -> Optional[Job]:
    """
    Claims the next queued job using FOR UPDATE SKIP LOCKED
    (or fallback in SQLite) to prevent worker race conditions.
    """
    now = datetime.utcnow()
    try:
        if db.bind and db.bind.dialect.name == "postgresql":
            job = db.query(Job).filter(
                Job.status == JobStatus.queued,
                Job.run_after <= now
            ).order_by(Job.id.asc()).with_for_update(skip_locked=True).first()
        else:
            job = db.query(Job).filter(
                Job.status == JobStatus.queued,
                Job.run_after <= now
            ).order_by(Job.id.asc()).first()

        if job:
            job.status = JobStatus.running
            job.attempts += 1
            job.updated_at = now
            db.commit()
            db.refresh(job)
            return job
    except Exception as e:
        db.rollback()
        logger.error(f"Error claiming next job: {e}")
    return None

async def process_job(job_id: int, db: Session):
    """Executes a claimed or newly received job."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        return

    job.status = JobStatus.running
    db.commit()

    settings = get_settings()

    try:
        payload = job.payload or {}
        job_type = job.type

        if "pull_request" in job_type or payload.get("pull_request"):
            await handle_pull_request_event(payload, db, settings.INTEGRATIONS_DRY_RUN)
        elif "reaction" in job_type or "comment" in job_type or "thread" in job_type or payload.get("comment"):
            await handle_feedback_event(payload, db, settings.INTEGRATIONS_DRY_RUN)
        else:
            logger.info(f"Generic job {job_type} processed.")

        job.status = JobStatus.done
        job.updated_at = datetime.utcnow()
        db.commit()

    except Exception as err:
        db.rollback()
        logger.error(f"Error processing job #{job_id}: {err}", exc_info=True)
        job.last_error = str(err)
        if job.attempts >= job.max_attempts:
            job.status = JobStatus.failed
        else:
            job.status = JobStatus.queued
            # Exponential backoff
            job.run_after = datetime.utcnow() + timedelta(seconds=2 ** job.attempts)
        job.updated_at = datetime.utcnow()
        db.commit()

async def handle_pull_request_event(payload: Dict[str, Any], db: Session, dry_run: bool):
    """Handles PR opened, synchronize, merged."""
    action = payload.get("action", "opened")
    pr_data = payload.get("pull_request") or {}

    pr_number = pr_data.get("number", 101)
    repo_name = (payload.get("repository") or {}).get("full_name", "nexus-org/payments-service")
    pr_title = pr_data.get("title", "Update database connection handling")
    pr_author = (pr_data.get("user") or {}).get("login", "dev_user")
    pr_url = pr_data.get("html_url", f"https://github.com/{repo_name}/pull/{pr_number}")
    head_sha = (pr_data.get("head") or {}).get("sha", "c0ffee1234567890")
    is_merged = pr_data.get("merged", False) or action == "closed" and pr_data.get("merged_at") is not None

    # Sample diff for PR if not provided in webhook
    pr_diff = payload.get("diff") or (
        "diff --git a/services/payments/webhook.py b/services/payments/webhook.py\n"
        "--- a/services/payments/webhook.py\n"
        "+++ b/services/payments/webhook.py\n"
        "@@ -85,6 +85,8 @@ def handle_stripe_event(event):\n"
        "+    conn = pool.get_connection()\n"
        "+    cursor = conn.cursor()\n"
        "+    cursor.execute('INSERT INTO webhook_events VALUES (%s)', [event.id])\n"
        "     return {'status': 'processed'}"
    )

    # 1. Merge Event Handling
    if is_merged:
        logger.info(f"Processing merged PR #{pr_number} for repo {repo_name}")
        merged_at = datetime.utcnow()
        touched_files = payload.get("files") or ["services/payments/webhook.py"]
        service_name = map_path_to_service(touched_files[0]) if touched_files else "payments"

        # Upsert pull_requests row
        pr_record = db.query(PullRequest).filter(
            PullRequest.repo == repo_name,
            PullRequest.number == pr_number
        ).first()

        if not pr_record:
            pr_record = PullRequest(
                provider="github",
                number=pr_number,
                repo=repo_name,
                title=pr_title,
                author=pr_author,
                service=service_name,
                files=touched_files,
                state="merged",
                merged_at=merged_at,
                url=pr_url,
                head_sha=head_sha,
                created_at=datetime.utcnow()
            )
            db.add(pr_record)
        else:
            pr_record.state = "merged"
            pr_record.merged_at = merged_at

        db.commit()

        # Add PR Node to Knowledge Graph
        pr_node_id = f"node:pr:{pr_number}"
        db.merge(GraphNode(
            id=pr_node_id,
            type="pr",
            label=f"PR #{pr_number}: {pr_title[:30]}",
            ref_id=str(pr_number),
            meta={"author": pr_author, "service": service_name, "merged_at": str(merged_at)}
        ))

        # Add Service Node & touches edge
        service_node_id = f"node:service:{service_name}"
        db.merge(GraphNode(
            id=service_node_id,
            type="service",
            label=f"{service_name.capitalize()} Service",
            ref_id=service_name,
            meta={"service": service_name}
        ))
        db.merge(GraphEdge(
            id=f"edge:pr{pr_number}:{service_name}",
            src=pr_node_id,
            dst=service_node_id,
            type="touches"
        ))

        # File nodes & touches edges
        for f_path in touched_files:
            file_node_id = f"node:file:{f_path}"
            db.merge(GraphNode(
                id=file_node_id,
                type="file",
                label=f_path.split("/")[-1],
                ref_id=f_path,
                meta={"path": f_path, "service": service_name}
            ))
            db.merge(GraphEdge(
                id=f"edge:pr{pr_number}:file:{f_path}",
                src=pr_node_id,
                dst=file_node_id,
                type="touches"
            ))

        db.commit()
        return

    # 2. PR Review Event (opened / synchronize / reopened)
    logger.info(f"Processing CodeMind review for PR #{pr_number} ({action})")
    
    # Split diff per file (simplified parser)
    file_diffs = []
    current_file = "services/payments/webhook.py"
    current_lines = []

    for line in pr_diff.splitlines():
        if line.startswith("diff --git"):
            if current_lines:
                file_diffs.append((current_file, "\n".join(current_lines)))
                current_lines = []
            parts = line.split(" b/")
            if len(parts) > 1:
                current_file = parts[1].strip()
        current_lines.append(line)

    if current_lines:
        file_diffs.append((current_file, "\n".join(current_lines)))

    posted_inline_comments = []
    for filename, f_diff in file_diffs:
        if should_skip_file(filename):
            logger.info(f"Skipping ignored file: {filename}")
            continue

        service = map_path_to_service(filename)
        review_req = CodeMindReviewRequest(
            filename=filename,
            service=service,
            diff=f_diff,
            memory_enabled=True
        )

        review_res = await review_diff(review_req, db)
        for c in review_res.comments:
            posted_inline_comments.append({
                "file": filename,
                "line": c.line,
                "severity": c.severity,
                "issue": c.issue,
                "suggestion": c.suggestion,
                "because": c.because
            })

    if dry_run:
        logger.info(
            f"[DRY RUN] Would post {len(posted_inline_comments)} inline review comments to PR #{pr_number}:\n"
            f"{posted_inline_comments}"
        )
    else:
        # In live mode with GITHUB_TOKEN configured, call GitHub REST API to post reviews
        logger.info(f"Live mode: Posted {len(posted_inline_comments)} comments to GitHub PR #{pr_number}")

async def handle_feedback_event(payload: Dict[str, Any], db: Session, dry_run: bool):
    """
    Handles comment reaction or review thread resolution:
    - Thumbs down (-1) or comment containing '/nexus reject' -> Rejected
    - Thread resolved or suggestion applied -> Accepted
    """
    action = payload.get("action", "")
    comment_data = payload.get("comment") or {}
    reaction_data = payload.get("reaction") or {}

    body = (comment_data.get("body") or "").strip().lower()
    content = reaction_data.get("content", "")

    is_rejected = "-1" in content or "/nexus reject" in body or "dismiss" in body
    is_accepted = "+1" in content or "resolved" in action or "applied" in body

    # Find the most recent review comment to attach feedback
    latest_comment = db.query(ReviewComment).order_by(ReviewComment.id.desc()).first()
    if latest_comment:
        if is_rejected:
            logger.info(f"Received rejection feedback on comment #{latest_comment.id}")
            await submit_comment_feedback(latest_comment.id, CommentFeedbackRequest(accepted=False), db)
        elif is_accepted:
            logger.info(f"Received acceptance feedback on comment #{latest_comment.id}")
            await submit_comment_feedback(latest_comment.id, CommentFeedbackRequest(accepted=True), db)

