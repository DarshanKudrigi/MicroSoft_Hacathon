from __future__ import annotations
import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Set test environment variables before importing app
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["API_KEY"] = "test-secret-key"
os.environ["GITHUB_WEBHOOK_SECRET"] = "test-github-secret"
os.environ["GITLAB_WEBHOOK_TOKEN"] = "test-gitlab-secret"
os.environ["INTEGRATIONS_DRY_RUN"] = "true"
os.environ["HINDSIGHT_API_KEY"] = ""
os.environ["GROQ_API_KEY"] = ""

from app.main import app, get_db
from app.models import Base

from sqlalchemy.pool import StaticPool

# Setup in-memory SQLite for testing with StaticPool so all sessions share the tables
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

@pytest.fixture(scope="session", autouse=True)
def setup_database():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)

@pytest.fixture
def db_session():
    session = TestingSessionLocal()
    yield session
    session.close()

@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

