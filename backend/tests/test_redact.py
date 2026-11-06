from __future__ import annotations
import pytest
from app.redact import redact_secrets

def test_redact_bearer_token():
    raw = "Request failed with header: Bearer abcdef1234567890xyz and status 401"
    sanitized = redact_secrets(raw)
    assert "abcdef1234567890xyz" not in sanitized
    assert "Bearer [REDACTED_TOKEN]" in sanitized

def test_redact_authorization_header():
    raw = "Authorization: Basic dXNlcjpwYXNzd29yZA==\nUser-Agent: curl"
    sanitized = redact_secrets(raw)
    assert "Basic dXNlcjpwYXNzd29yZA==" not in sanitized
    assert "Authorization: [REDACTED_AUTH]" in sanitized

def test_redact_private_key():
    raw = (
        "Error loading SSL cert:\n"
        "-----BEGIN RSA PRIVATE KEY-----\n"
        "MIIEowIBAAKCAQEA0Y1m9t...\n"
        "-----END RSA PRIVATE KEY-----\n"
        "Certificate expired"
    )
    sanitized = redact_secrets(raw)
    assert "MIIEowIBAAKCAQEA0Y1m9t" not in sanitized
    assert "[REDACTED_PRIVATE_KEY]" in sanitized

def test_redact_connection_string():
    raw = "Failed connecting to postgresql://admin:super_secret_pw123@db.prod.internal:5432/nexus_db"
    sanitized = redact_secrets(raw)
    assert "super_secret_pw123" not in sanitized
    assert "postgresql://admin:[REDACTED_PASSWORD]@db.prod.internal:5432/nexus_db" in sanitized

def test_redact_groq_api_key():
    raw = "Groq client initialized with key gsk_1234567890abcdef1234567890 in env"
    sanitized = redact_secrets(raw)
    assert "gsk_1234567890abcdef1234567890" not in sanitized
    assert "[REDACTED_GROQ_KEY]" in sanitized

def test_redact_github_and_gitlab_tokens():
    raw = "GitHub: ghp_1234567890abcdef1234567890abcdef1234 and GitLab: glpat-abcdef1234567890abcd"
    sanitized = redact_secrets(raw)
    assert "ghp_1234567890abcdef1234567890abcdef1234" not in sanitized
    assert "glpat-abcdef1234567890abcd" not in sanitized
    assert "[REDACTED_GITHUB_TOKEN]" in sanitized
    assert "[REDACTED_GITLAB_TOKEN]" in sanitized

def test_redact_jwt_token():
    raw = "Token received: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    sanitized = redact_secrets(raw)
    assert "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c" not in sanitized
    assert "[REDACTED_JWT]" in sanitized

def test_redact_key_value_secrets():
    raw = '{"db_host": "localhost", "password": "my_db_password_999", "secret": "s3cr3t_v4lu3"}'
    sanitized = redact_secrets(raw)
    assert "my_db_password_999" not in sanitized
    assert "s3cr3t_v4lu3" not in sanitized
    assert '[REDACTED]' in sanitized

def test_redact_empty_or_none():
    assert redact_secrets("") == ""
    assert redact_secrets(None) == ""

