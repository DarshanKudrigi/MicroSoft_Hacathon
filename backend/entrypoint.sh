#!/bin/sh
set -e

echo "Applying Alembic database migrations..."
alembic upgrade head

echo "Populating initial seed data (40 incidents & Incident #12)..."
python -m seed.seed_data || echo "Seed completed or skipped"

echo "Starting Nexus AI FastAPI application..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000

