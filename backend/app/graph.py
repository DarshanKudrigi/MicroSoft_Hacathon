from __future__ import annotations
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.main import get_db
from app.models import GraphNode, GraphEdge, Incident, ReviewComment, PullRequest
from app.schemas import GraphResponse, GraphNodeOut, GraphEdgeOut, GraphNodeDetailResponse
from app.memory import get_memory_service

logger = logging.getLogger("nexus.graph")

router = APIRouter(prefix="/api/graph", tags=["graph"])

@router.get("", response_model=GraphResponse)
async def get_knowledge_graph(
    service: Optional[str] = Query(None, description="Filter by service name"),
    cause: Optional[str] = Query(None, description="Filter by root cause category"),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db)
):
    """
    Returns the Knowledge Graph: nodes and edges connecting
    services, incidents, root cause categories, rules, PRs, files, and comments.
    """
    node_query = db.query(GraphNode)
    is_postgres = bool(db.bind and db.bind.dialect.name == "postgresql")
    if service:
        # Match nodes related to service
        if is_postgres:
            node_query = node_query.filter(
                (GraphNode.meta["service"].astext == service) |
                (GraphNode.id == f"node:service:{service}")
            )
        else:
            node_query = node_query.filter(
                (GraphNode.id == f"node:service:{service}") |
                (GraphNode.id.contains(service))
            )
    if cause:
        if is_postgres:
            node_query = node_query.filter(
                (GraphNode.meta["category"].astext == cause) |
                (GraphNode.id == f"node:root_cause:{cause}")
            )
        else:
            node_query = node_query.filter(
                (GraphNode.id == f"node:root_cause:{cause}") |
                (GraphNode.id.contains(cause))
            )

    nodes = node_query.limit(limit).all()
    node_ids = {n.id for n in nodes}

    # Edges where both src and dst exist in our selected nodes
    edges = db.query(GraphEdge).filter(
        GraphEdge.src.in_(node_ids),
        GraphEdge.dst.in_(node_ids)
    ).all() if node_ids else []

    return GraphResponse(
        nodes=[GraphNodeOut.model_validate(n) for n in nodes],
        edges=[GraphEdgeOut.model_validate(e) for e in edges]
    )

@router.get("/nodes/{node_id:path}", response_model=GraphNodeDetailResponse)
async def get_graph_node_detail(
    node_id: str,
    db: Session = Depends(get_db)
):
    """
    Returns full node details, memory text via get_by_id, and related records.
    """
    node = db.query(GraphNode).filter(GraphNode.id == node_id).first()
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "NOT_FOUND", "message": f"Graph node {node_id} not found"}}
        )

    memory_service = get_memory_service()
    memory_text = None
    if node.memory_id:
        mem_data = await memory_service.get_by_id(node.memory_id)
        if mem_data:
            memory_text = mem_data.get("text")

    related: Dict[str, Any] = {}
    if node.type == "incident":
        inc_id = int(node.ref_id) if node.ref_id.isdigit() else None
        if inc_id:
            inc = db.query(Incident).filter(Incident.id == inc_id).first()
            if inc:
                related["incident"] = {
                    "id": inc.id,
                    "service": inc.service,
                    "root_cause": inc.root_cause,
                    "minutes_to_resolve": inc.minutes_to_resolve,
                    "status": inc.status,
                    "logs_preview": inc.logs[:300]
                }
    elif node.type == "pr":
        pr_num = int(node.ref_id) if node.ref_id.isdigit() else None
        if pr_num:
            pr = db.query(PullRequest).filter(PullRequest.number == pr_num).first()
            if pr:
                related["pull_request"] = {
                    "number": pr.number,
                    "title": pr.title,
                    "author": pr.author,
                    "service": pr.service,
                    "state": pr.state,
                    "url": pr.url
                }

    # Fetch incident or rule neighbors
    incoming_edges = db.query(GraphEdge).filter(GraphEdge.dst == node.id).all()
    outgoing_edges = db.query(GraphEdge).filter(GraphEdge.src == node.id).all()

    related["connections"] = {
        "incoming": [{"src": e.src, "type": e.type} for e in incoming_edges],
        "outgoing": [{"dst": e.dst, "type": e.type} for e in outgoing_edges]
    }

    return GraphNodeDetailResponse(
        node=GraphNodeOut.model_validate(node),
        memory_text=memory_text,
        related_records=related
    )

