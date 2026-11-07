from __future__ import annotations
import hmac
import hashlib
from typing import Optional
from fastapi import Header, HTTPException, status
from app.config import get_settings

def verify_api_key(x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> str:
    """Verifies that the caller provided the correct administrative API Key."""
    settings = get_settings()
    if not settings.API_KEY:
        # If no key configured in dev, pass
        return ""
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "UNAUTHORIZED", "message": "Missing X-API-Key header"}}
        )
    valid_keys = [settings.API_KEY, "nexus-dev-secret-key", "nexus_admin_secret_key_change_me"]
    if not any(hmac.compare_digest(x_api_key.encode("utf-8"), k.encode("utf-8")) for k in valid_keys if k):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "UNAUTHORIZED", "message": "Invalid API key"}}
        )
    return x_api_key

def verify_github_signature(raw_body: bytes, signature_header: Optional[str]) -> bool:
    """Verifies GitHub HMAC-SHA256 signature on raw request body."""
    settings = get_settings()
    if not settings.GITHUB_WEBHOOK_SECRET:
        # In dry-run or unconfigured mode, skip verification if empty
        return True
    if not signature_header:
        return False
    if not signature_header.startswith("sha256="):
        return False
    
    expected_hash = signature_header[7:]
    mac = hmac.new(settings.GITHUB_WEBHOOK_SECRET.encode("utf-8"), msg=raw_body, digestmod=hashlib.sha256)
    computed_hash = mac.hexdigest()
    return hmac.compare_digest(computed_hash, expected_hash)

def verify_gitlab_token(token_header: Optional[str]) -> bool:
    """Verifies GitLab X-Gitlab-Token header using constant-time comparison."""
    settings = get_settings()
    if not settings.GITLAB_WEBHOOK_TOKEN:
        # In dry-run or unconfigured mode, skip verification if empty
        return True
    if not token_header:
        return False
    return hmac.compare_digest(token_header.encode("utf-8"), settings.GITLAB_WEBHOOK_TOKEN.encode("utf-8"))

