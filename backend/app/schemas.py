from __future__ import annotations
from datetime import datetime, date
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field, ConfigDict
from app.models import RootCauseCategory, StepKind, CommentStatus, JobStatus

# Structured error wrapper (Section 18)
class ErrorDetail(BaseModel):
    code: str
    message: str

class ErrorResponse(BaseModel):
    error: ErrorDetail

# Health Schemas
class DatabaseHealth(BaseModel):
    connected: bool
    dialect: str
    error: Optional[str] = None

class LLMHealth(BaseModel):
    provider: str = "groq"
    primary_model: str
    primary_available: bool
    fallback_model: str
    fallback_available: bool
    error: Optional[str] = None

class MemoryHealth(BaseModel):
    provider: str = "hindsight"
    connected: bool
    bank_id: str
    status: str
    error: Optional[str] = None

class HealthResponse(BaseModel):
    status: str  # "ok" | "degraded"
    database: DatabaseHealth
    llm: LLMHealth
    memory: MemoryHealth

# Sentinel Signature (LLM Call 1)
class SentinelSignature(BaseModel):
    service: str
    errorType: str
    symptoms: List[str]
    severity: str

# Sentinel Hypothesis
class HypothesisItem(BaseModel):
    cause: str
    confidence: float
    evidence: List[str]

# Sentinel Root Cause Analysis (LLM Call 2)
class SentinelRCAResponse(BaseModel):
    rootCause: str
    rootCauseCategory: RootCauseCategory
    confidence: float
    causalChain: List[str]
    contributingFactors: List[str]
    hypotheses: List[HypothesisItem]
    verifySteps: List[str]
    steps: List[str]
    usedMemories: List[str]

# Sentinel Diagnose Request & Endpoint Response
class SentinelDiagnoseRequest(BaseModel):
    service: str
    logs: str
    memory_enabled: bool = True

class IncidentStepOut(BaseModel):
    kind: StepKind
    position: Integer = Field(..., alias="position")
    text: str

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class SentinelDiagnoseResponse(BaseModel):
    incident_id: int
    service: str
    signature: SentinelSignature
    analysis: SentinelRCAResponse
    recalled_memories: List[Dict[str, Any]]
    memory_enabled: bool
    memory_available: bool

class SentinelOutcomeRequest(BaseModel):
    worked: bool
    minutesToResolve: int

class SentinelOutcomeResponse(BaseModel):
    incident_id: int
    status: str
    minutes_to_resolve: int
    memory_id: Optional[str] = None
    rule_id: Optional[str] = None
    message: str

# CodeMind Schemas
class CodeMindReviewRequest(BaseModel):
    filename: str
    service: Optional[str] = None
    diff: str
    memory_enabled: bool = True

class DiffSummary(BaseModel):
    service: str
    summary: str
    riskyAreas: List[str]
    searchQuery: str

class ReviewCommentItem(BaseModel):
    line: int
    severity: str
    issue: str
    suggestion: str
    because: str
    memoryId: Optional[str] = None

class ReviewCommentOut(BaseModel):
    id: int
    line: int
    severity: str
    issue: str
    suggestion: str
    because: str
    memory_id: Optional[str] = None
    status: CommentStatus
    fingerprint: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class CodeMindReviewResponse(BaseModel):
    review_id: int
    filename: str
    service: str
    summary: str
    comments: List[ReviewCommentOut]
    recalled_memories: List[Dict[str, Any]]
    memory_enabled: bool
    memory_available: bool

class CommentFeedbackRequest(BaseModel):
    accepted: bool

class CommentFeedbackResponse(BaseModel):
    comment_id: int
    status: CommentStatus
    fingerprint: str
    learning_event_id: Optional[int] = None
    message: str

# Graph Schemas
class GraphNodeOut(BaseModel):
    id: str
    type: str
    label: str
    ref_id: str
    memory_id: Optional[str] = None
    meta: Dict[str, Any]

    model_config = ConfigDict(from_attributes=True)

class GraphEdgeOut(BaseModel):
    id: str
    src: str
    dst: str
    type: str

    model_config = ConfigDict(from_attributes=True)

class GraphResponse(BaseModel):
    nodes: List[GraphNodeOut]
    edges: List[GraphEdgeOut]

class GraphNodeDetailResponse(BaseModel):
    node: GraphNodeOut
    memory_text: Optional[str] = None
    related_records: Dict[str, Any]

# Analytics Schemas
class MTTRTrendPoint(BaseModel):
    date: str
    avg_mttr: float
    incidents_count: int

class AcceptanceTrendPoint(BaseModel):
    date: str
    acceptance_rate: float
    comments_count: int

class ServiceBreakdownItem(BaseModel):
    service: str
    incidents: int
    avg_mttr: float
    reviews: int
    repeat_issues_caught: int

class AnalyticsSummary(BaseModel):
    mttr_trend: List[MTTRTrendPoint]
    weekly_improvement_slope: float
    repeat_incident_rate: float
    rule_catch_rate: float
    repeat_issues_caught: int
    comment_acceptance_rate: float
    acceptance_trend: List[AcceptanceTrendPoint]
    memory_on_confidence: float
    memory_off_confidence: float
    estimated_hours_saved: float
    service_breakdown: List[ServiceBreakdownItem]
    manager_takeaways: List[str]
    is_synthetic: bool = True

# Dashboard Schema
class DashboardResponse(BaseModel):
    total_incidents: int
    active_rules: int
    repeat_issues_caught: int
    avg_mttr_current: float
    mttr_reduction_pct: float
    resolution_time_series: List[Dict[str, Any]]
    learning_feed: List[Dict[str, Any]]
    analytics: AnalyticsSummary

