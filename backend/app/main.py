from __future__ import annotations
import logging
from typing import Generator
from fastapi import FastAPI, Depends, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
import httpx

from app.config import get_settings
from app.models import Base
from app.schemas import HealthResponse, DatabaseHealth, LLMHealth, MemoryHealth, ErrorResponse
from app.llm import get_llm_service

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nexus")

settings = get_settings()

# Setup database engine
# Handle sqlite vs postgresql dialect nuances
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

app = FastAPI(
    title="Nexus AI",
    description="Cross-agent learning platform connecting Sentinel and CodeMind with Hindsight memory.",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global structured exception handler (Section 18)
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": {"code": "INTERNAL_ERROR", "message": str(exc)}}
    )

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """
    Verifies Database connectivity, Groq primary and fallback models,
    and Hindsight memory bank status.
    """
    # 1. Database check
    db_connected = False
    dialect = "unknown"
    db_err = None
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            db_connected = True
            dialect = engine.dialect.name
    except Exception as e:
        db_err = str(e)
        logger.warning(f"Database health check failed: {e}")

    # 2. LLM check (Groq primary and fallback models)
    llm_service = get_llm_service()
    llm_health_data = await llm_service.check_groq_health()
    llm_health = LLMHealth(
        provider="groq",
        primary_model=llm_health_data["primary_model"],
        primary_available=llm_health_data["primary_available"],
        fallback_model=llm_health_data["fallback_model"],
        fallback_available=llm_health_data["fallback_available"],
        error=None if (llm_health_data["primary_available"] or llm_health_data["fallback_available"]) else "No Groq models available or invalid API key"
    )

    # 3. Memory check (Hindsight)
    hindsight_connected = False
    hindsight_status = "unavailable"
    hindsight_err = None
    if settings.HINDSIGHT_API_KEY:
        try:
            # Ping Hindsight API
            base_url = settings.HINDSIGHT_BASE_URL.rstrip("/")
            test_url = f"{base_url}/health" if not base_url.endswith("/v1") else f"{base_url}/default/banks"
            headers = {"Authorization": f"Bearer {settings.HINDSIGHT_API_KEY}"}
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(test_url, headers=headers)
                if res.status_code in (200, 404):  # connected even if health endpoint path differs
                    hindsight_connected = True
                    hindsight_status = "ready"
                else:
                    hindsight_err = f"Status code {res.status_code}"
        except Exception as e:
            hindsight_err = str(e)
    else:
        hindsight_err = "HINDSIGHT_API_KEY is not configured"

    memory_health = MemoryHealth(
        provider="hindsight",
        connected=hindsight_connected,
        bank_id=settings.HINDSIGHT_BANK_ID,
        status=hindsight_status,
        error=hindsight_err
    )

    overall_status = "ok" if (db_connected and (llm_health.primary_available or llm_health.fallback_available)) else "degraded"

    return HealthResponse(
        status=overall_status,
        database=DatabaseHealth(
            connected=db_connected,
            dialect=dialect,
            error=db_err
        ),
        llm=llm_health,
        memory=memory_health
    )

from app.security import verify_api_key
from seed.seed_data import run_seed
from app.sentinel import router as sentinel_router
from app.codemind import router as codemind_router
from app.integrations import router as integrations_router
from app.analytics import router as analytics_router
from app.graph import router as graph_router

app.include_router(sentinel_router)
app.include_router(codemind_router)
app.include_router(integrations_router)
app.include_router(analytics_router)
app.include_router(graph_router)

@app.post("/api/admin/seed", dependencies=[Depends(verify_api_key)])
async def admin_seed_data(db: Session = Depends(get_db)):
    """
    Idempotent seeding endpoint for synthetic evaluation data.
    Protected by X-API-Key header.
    """
    res = await run_seed(db)
    return res

@app.get("/")
async def root():
    return {"message": "Nexus AI API is running", "docs": "/docs"}

