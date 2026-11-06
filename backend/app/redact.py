from __future__ import annotations
import re
from typing import Optional

# Precompiled regex patterns for secret stripping
_BEARER_PATTERN = re.compile(r'(?i)\bbearer\s+[a-zA-Z0-9_\-\.]{12,}')
_AUTH_HEADER_PATTERN = re.compile(r'(?i)(authorization:\s*)([^\r\n]+)')
_PRIVATE_KEY_PATTERN = re.compile(
    r'-----BEGIN [A-Z\s]+PRIVATE KEY-----[\s\S]*?-----END [A-Z\s]+PRIVATE KEY-----',
    re.MULTILINE
)
_CONN_STRING_PATTERN = re.compile(
    r'(?i)\b((?:postgres(?:ql)?|mysql|redis|mongodb):\/\/)([^:\s]+):([^@\s]+)@'
)
_GROQ_KEY_PATTERN = re.compile(r'\bgsk_[a-zA-Z0-9]{20,}\b')
_GITHUB_TOKEN_PATTERN = re.compile(r'\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{30,}\b')
_GITLAB_TOKEN_PATTERN = re.compile(r'\bglpat-[a-zA-Z0-9_\-]{20,}\b')
_AWS_KEY_PATTERN = re.compile(r'\bAKIA[0-9A-Z]{16}\b')
_SLACK_TOKEN_PATTERN = re.compile(r'\bxox[baprs]-[0-9a-zA-Z\-]{10,}\b')
_JWT_PATTERN = re.compile(r'\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b')

# Key-value secret patterns (e.g., password = "...", "secret": "...")
_KV_SECRET_PATTERN = re.compile(
    r'(?i)\b(password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)'
    r'([\'"]?\s*[:=]\s*[\'"]?)([^"\'\s,;]+)([\'"]?)'
)

def redact_secrets(text: Optional[str]) -> str:
    """
    Strips secrets (API keys, tokens, passwords, bearer headers, private keys, connection strings)
    from logs, diffs, and prompts before any LLM call, DB write, or memory retain.
    """
    if not text:
        return ""

    # 1. Private keys
    sanitized = _PRIVATE_KEY_PATTERN.sub('[REDACTED_PRIVATE_KEY]', text)

    # 2. Connection strings (preserve scheme and user, redact password)
    sanitized = _CONN_STRING_PATTERN.sub(r'\1\2:[REDACTED_PASSWORD]@', sanitized)

    # 3. Known vendor tokens
    sanitized = _GROQ_KEY_PATTERN.sub('[REDACTED_GROQ_KEY]', sanitized)
    sanitized = _GITHUB_TOKEN_PATTERN.sub('[REDACTED_GITHUB_TOKEN]', sanitized)
    sanitized = _GITLAB_TOKEN_PATTERN.sub('[REDACTED_GITLAB_TOKEN]', sanitized)
    sanitized = _AWS_KEY_PATTERN.sub('[REDACTED_AWS_KEY]', sanitized)
    sanitized = _SLACK_TOKEN_PATTERN.sub('[REDACTED_SLACK_TOKEN]', sanitized)
    sanitized = _JWT_PATTERN.sub('[REDACTED_JWT]', sanitized)

    # 4. Bearer tokens
    sanitized = _BEARER_PATTERN.sub('Bearer [REDACTED_TOKEN]', sanitized)

    # 5. Authorization headers
    sanitized = _AUTH_HEADER_PATTERN.sub(r'\1[REDACTED_AUTH]', sanitized)

    # 6. Key-value secrets
    sanitized = _KV_SECRET_PATTERN.sub(r'\1\2[REDACTED]\4', sanitized)

    return sanitized

