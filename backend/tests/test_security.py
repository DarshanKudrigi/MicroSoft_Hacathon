from __future__ import annotations
import hmac
import hashlib
import pytest
from fastapi import HTTPException
from app.security import verify_api_key, verify_github_signature, verify_gitlab_token

def test_verify_api_key_valid():
    key = verify_api_key("test-secret-key")
    assert key == "test-secret-key"

def test_verify_api_key_missing():
    with pytest.raises(HTTPException) as exc_info:
        verify_api_key(None)
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail["error"]["code"] == "UNAUTHORIZED"

def test_verify_api_key_invalid():
    with pytest.raises(HTTPException) as exc_info:
        verify_api_key("wrong-secret-key")
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail["error"]["code"] == "UNAUTHORIZED"

def test_verify_github_signature():
    secret = "test-github-secret"
    payload = b'{"action": "opened", "pull_request": {"number": 42}}'
    mac = hmac.new(secret.encode("utf-8"), msg=payload, digestmod=hashlib.sha256)
    valid_sig = f"sha256={mac.hexdigest()}"

    assert verify_github_signature(payload, valid_sig) is True
    assert verify_github_signature(payload, "sha256=invalidhash123") is False
    assert verify_github_signature(payload, None) is False

def test_verify_gitlab_token():
    assert verify_gitlab_token("test-gitlab-secret") is True
    assert verify_gitlab_token("wrong-token") is False
    assert verify_gitlab_token(None) is False

