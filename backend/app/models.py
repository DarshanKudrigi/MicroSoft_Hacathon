from __future__ import annotations
import enum
from datetime import datetime, date
from typing import Optional, List, Any
from sqlalchemy import (
    Column, Integer, BigInteger, String, Text, Float, Boolean,
    DateTime, Date, ForeignKey, Enum as SQLEnum, JSON, UniqueConstraint, Index
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class RootCauseCategory(str, enum.Enum):
    connection_pool = "connection_pool"
    oom = "oom"
    bad_config = "bad_config"
    slow_query = "slow_query"
    thread_starvation = "thread_starvation"
    other = "other"

class StepKind(str, enum.Enum):
    verify = "verify"
    fix = "fix"

class IncidentStatus(str, enum.Enum):
    open = "open"
    resolved = "resolved"
    failed = "failed"

class CommentStatus(str, enum.Enum):
    open = "open"
    accepted = "accepted"
    rejected = "rejected"

class JobStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    done = "done"
    failed = "failed"

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    service = Column(String(100), nullable=False, index=True)
    logs = Column(Text, nullable=False)
    root_cause = Column(Text, nullable=False)
    root_cause_category = Column(
        SQLEnum(RootCauseCategory, native_enum=False),
        nullable=False,
        index=True
    )
    confidence = Column(Float, nullable=False, default=0.0)
    status = Column(String(50), nullable=False, default="open", index=True)
    minutes_to_resolve = Column(Integer, nullable=True)
    memory_enabled = Column(Boolean, nullable=False, default=True)
    memory_id = Column(String(255), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    steps = relationship("IncidentStep", back_populates="incident", cascade="all, delete-orphan")

class IncidentStep(Base):
    __tablename__ = "incident_steps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    incident_id = Column(BigInteger().with_variant(Integer, "sqlite"), ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(SQLEnum(StepKind, native_enum=False), nullable=False)
    position = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)

    incident = relationship("Incident", back_populates="steps")

class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)
    filename = Column(String(255), nullable=False)
    service = Column(String(100), nullable=False, index=True)
    diff = Column(Text, nullable=False)
    summary = Column(Text, nullable=False)
    memory_enabled = Column(Boolean, nullable=False, default=True)
    pr_id = Column(Integer, nullable=True, index=True)
    provider = Column(String(50), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    comments = relationship("ReviewComment", back_populates="review", cascade="all, delete-orphan")

class ReviewComment(Base):
    __tablename__ = "review_comments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    review_id = Column(Integer, ForeignKey("reviews.id", ondelete="CASCADE"), nullable=False, index=True)
    line = Column(Integer, nullable=False)
    severity = Column(String(50), nullable=False, default="warning")
    issue = Column(Text, nullable=False)
    suggestion = Column(Text, nullable=False)
    because = Column(Text, nullable=False)
    memory_id = Column(String(255), nullable=True, index=True)
    status = Column(SQLEnum(CommentStatus, native_enum=False), nullable=False, default=CommentStatus.open)
    fingerprint = Column(String(255), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    review = relationship("Review", back_populates="comments")

class RejectedPattern(Base):
    __tablename__ = "rejected_patterns"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fingerprint = Column(String(255), nullable=False, index=True)
    service = Column(String(100), nullable=False, index=True)
    issue_text = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class LearningEvent(Base):
    __tablename__ = "learning_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    type = Column(String(100), nullable=False, index=True)
    source_incident_id = Column(BigInteger().with_variant(Integer, "sqlite"), nullable=True, index=True)
    memory_id = Column(String(255), nullable=True, index=True)
    detail = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class MetricDaily(Base):
    __tablename__ = "metrics_daily"

    date = Column(Date, primary_key=True)
    service = Column(String(100), primary_key=True)
    incidents = Column(Integer, nullable=False, default=0)
    avg_mttr = Column(Float, nullable=False, default=0.0)
    comments = Column(Integer, nullable=False, default=0)
    accepted = Column(Integer, nullable=False, default=0)
    repeat_incidents = Column(Integer, nullable=False, default=0)
    rule_catches = Column(Integer, nullable=False, default=0)

class MemoryRecall(Base):
    __tablename__ = "memory_recalls"

    memory_id = Column(String(255), primary_key=True)
    count = Column(Integer, nullable=False, default=1)
    last_recalled_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class Integration(Base):
    __tablename__ = "integrations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider = Column(String(50), nullable=False, index=True)
    repo = Column(String(255), nullable=False)
    config = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class PullRequest(Base):
    __tablename__ = "pull_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider = Column(String(50), nullable=False)
    number = Column(Integer, nullable=False)
    repo = Column(String(255), nullable=False)
    title = Column(String(255), nullable=False)
    author = Column(String(100), nullable=False)
    service = Column(String(100), nullable=False, index=True)
    files = Column(JSON, nullable=False, default=list)
    state = Column(String(50), nullable=False, default="open")
    merged_at = Column(DateTime, nullable=True)
    url = Column(String(500), nullable=False)
    head_sha = Column(String(100), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    type = Column(String(100), nullable=False, index=True)
    payload = Column(JSON, nullable=False, default=dict)
    status = Column(SQLEnum(JobStatus, native_enum=False), nullable=False, default=JobStatus.queued, index=True)
    attempts = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=3)
    run_after = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_error = Column(Text, nullable=True)
    dedupe_key = Column(String(255), unique=True, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

class GraphNode(Base):
    __tablename__ = "graph_nodes"

    id = Column(String(255), primary_key=True)
    type = Column(String(50), nullable=False, index=True)  # service, incident, root_cause, rule, pr, file, comment
    label = Column(String(255), nullable=False)
    ref_id = Column(String(255), nullable=False)
    memory_id = Column(String(255), nullable=True, index=True)
    meta = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("type", "ref_id", name="uq_graph_nodes_type_ref_id"),
    )

class GraphEdge(Base):
    __tablename__ = "graph_edges"

    id = Column(String(255), primary_key=True)
    src = Column(String(255), ForeignKey("graph_nodes.id", ondelete="CASCADE"), nullable=False, index=True)
    dst = Column(String(255), ForeignKey("graph_nodes.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(50), nullable=False, index=True)  # occurred_in, caused_by, derived_rule, cited_by, touches, repeat_of
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("src", "dst", "type", name="uq_graph_edges_src_dst_type"),
    )

