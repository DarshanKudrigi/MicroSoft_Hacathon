from __future__ import annotations
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    # LLM settings (Groq)
    GROQ_API_KEY: str = ""
    GROQ_PRIMARY_MODEL: str = "openai/gpt-oss-120b"
    GROQ_FALLBACK_MODEL: str = "qwen/qwen3-32b"

    # Memory settings (Hindsight)
    HINDSIGHT_API_KEY: str = ""
    HINDSIGHT_BASE_URL: str = "https://api.hindsight.vectorize.io"
    HINDSIGHT_BANK_ID: str = "nexus-org"

    # Database
    DATABASE_URL: str = "postgresql://nexus_user:nexus_password@localhost:5432/nexus_db"

    # Admin & Mutating Security
    API_KEY: str = "nexus-dev-secret-key"

    # Integrations
    GITHUB_WEBHOOK_SECRET: str = ""
    GITHUB_TOKEN: str = ""
    GITLAB_WEBHOOK_TOKEN: str = ""
    GITLAB_TOKEN: str = ""
    INTEGRATIONS_DRY_RUN: bool = True

    # Logging
    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

@lru_cache()
def get_settings() -> Settings:
    return Settings()

