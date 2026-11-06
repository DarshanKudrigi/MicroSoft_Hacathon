"""001_initial_schema

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-11-06 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. incidents table
    op.create_table(
        'incidents',
        sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), autoincrement=True, nullable=False),
        sa.Column('service', sa.String(length=100), nullable=False),
        sa.Column('logs', sa.Text(), nullable=False),
        sa.Column('root_cause', sa.Text(), nullable=False),
        sa.Column('root_cause_category', sa.String(length=50), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='open'),
        sa.Column('minutes_to_resolve', sa.Integer(), nullable=True),
        sa.Column('memory_enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('memory_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_incidents_service'), 'incidents', ['service'], unique=False)
    op.create_index(op.f('ix_incidents_root_cause_category'), 'incidents', ['root_cause_category'], unique=False)
    op.create_index(op.f('ix_incidents_status'), 'incidents', ['status'], unique=False)
    op.create_index(op.f('ix_incidents_memory_id'), 'incidents', ['memory_id'], unique=False)

    # 2. incident_steps table
    op.create_table(
        'incident_steps',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('incident_id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False),
        sa.Column('kind', sa.String(length=50), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(['incident_id'], ['incidents.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_incident_steps_incident_id'), 'incident_steps', ['incident_id'], unique=False)

    # 3. reviews table
    op.create_table(
        'reviews',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('service', sa.String(length=100), nullable=False),
        sa.Column('diff', sa.Text(), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('memory_enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('pr_id', sa.Integer(), nullable=True),
        sa.Column('provider', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_reviews_service'), 'reviews', ['service'], unique=False)
    op.create_index(op.f('ix_reviews_pr_id'), 'reviews', ['pr_id'], unique=False)

    # 4. review_comments table
    op.create_table(
        'review_comments',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('review_id', sa.Integer(), nullable=False),
        sa.Column('line', sa.Integer(), nullable=False),
        sa.Column('severity', sa.String(length=50), nullable=False, server_default='warning'),
        sa.Column('issue', sa.Text(), nullable=False),
        sa.Column('suggestion', sa.Text(), nullable=False),
        sa.Column('because', sa.Text(), nullable=False),
        sa.Column('memory_id', sa.String(length=255), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='open'),
        sa.Column('fingerprint', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['review_id'], ['reviews.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_review_comments_review_id'), 'review_comments', ['review_id'], unique=False)
    op.create_index(op.f('ix_review_comments_fingerprint'), 'review_comments', ['fingerprint'], unique=False)
    op.create_index(op.f('ix_review_comments_memory_id'), 'review_comments', ['memory_id'], unique=False)

    # 5. rejected_patterns table
    op.create_table(
        'rejected_patterns',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('fingerprint', sa.String(length=255), nullable=False),
        sa.Column('service', sa.String(length=100), nullable=False),
        sa.Column('issue_text', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_rejected_patterns_fingerprint'), 'rejected_patterns', ['fingerprint'], unique=False)
    op.create_index(op.f('ix_rejected_patterns_service'), 'rejected_patterns', ['service'], unique=False)

    # 6. learning_events table
    op.create_table(
        'learning_events',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('type', sa.String(length=100), nullable=False),
        sa.Column('source_incident_id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=True),
        sa.Column('memory_id', sa.String(length=255), nullable=True),
        sa.Column('detail', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_learning_events_type'), 'learning_events', ['type'], unique=False)
    op.create_index(op.f('ix_learning_events_source_incident_id'), 'learning_events', ['source_incident_id'], unique=False)
    op.create_index(op.f('ix_learning_events_memory_id'), 'learning_events', ['memory_id'], unique=False)

    # 7. metrics_daily table
    op.create_table(
        'metrics_daily',
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('service', sa.String(length=100), nullable=False),
        sa.Column('incidents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('avg_mttr', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('comments', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('accepted', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('repeat_incidents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('rule_catches', sa.Integer(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('date', 'service')
    )

    # 8. memory_recalls table
    op.create_table(
        'memory_recalls',
        sa.Column('memory_id', sa.String(length=255), nullable=False),
        sa.Column('count', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('last_recalled_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('memory_id')
    )

    # 9. integrations table
    op.create_table(
        'integrations',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('provider', sa.String(length=50), nullable=False),
        sa.Column('repo', sa.String(length=255), nullable=False),
        sa.Column('config', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_integrations_provider'), 'integrations', ['provider'], unique=False)

    # 10. pull_requests table
    op.create_table(
        'pull_requests',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('provider', sa.String(length=50), nullable=False),
        sa.Column('number', sa.Integer(), nullable=False),
        sa.Column('repo', sa.String(length=255), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('author', sa.String(length=100), nullable=False),
        sa.Column('service', sa.String(length=100), nullable=False),
        sa.Column('files', sa.JSON(), nullable=False),
        sa.Column('state', sa.String(length=50), nullable=False, server_default='open'),
        sa.Column('merged_at', sa.DateTime(), nullable=True),
        sa.Column('url', sa.String(length=500), nullable=False),
        sa.Column('head_sha', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_pull_requests_service'), 'pull_requests', ['service'], unique=False)

    # 11. jobs table
    op.create_table(
        'jobs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('type', sa.String(length=100), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='queued'),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('max_attempts', sa.Integer(), nullable=False, server_default='3'),
        sa.Column('run_after', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('dedupe_key', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('dedupe_key', name='uq_jobs_dedupe_key')
    )
    op.create_index(op.f('ix_jobs_type'), 'jobs', ['type'], unique=False)
    op.create_index(op.f('ix_jobs_status'), 'jobs', ['status'], unique=False)

    # 12. graph_nodes table
    op.create_table(
        'graph_nodes',
        sa.Column('id', sa.String(length=255), nullable=False),
        sa.Column('type', sa.String(length=50), nullable=False),
        sa.Column('label', sa.String(length=255), nullable=False),
        sa.Column('ref_id', sa.String(length=255), nullable=False),
        sa.Column('memory_id', sa.String(length=255), nullable=True),
        sa.Column('meta', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('type', 'ref_id', name='uq_graph_nodes_type_ref_id')
    )
    op.create_index(op.f('ix_graph_nodes_type'), 'graph_nodes', ['type'], unique=False)
    op.create_index(op.f('ix_graph_nodes_memory_id'), 'graph_nodes', ['memory_id'], unique=False)

    # 13. graph_edges table
    op.create_table(
        'graph_edges',
        sa.Column('id', sa.String(length=255), nullable=False),
        sa.Column('src', sa.String(length=255), nullable=False),
        sa.Column('dst', sa.String(length=255), nullable=False),
        sa.Column('type', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['src'], ['graph_nodes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['dst'], ['graph_nodes.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('src', 'dst', 'type', name='uq_graph_edges_src_dst_type')
    )
    op.create_index(op.f('ix_graph_edges_src'), 'graph_edges', ['src'], unique=False)
    op.create_index(op.f('ix_graph_edges_dst'), 'graph_edges', ['dst'], unique=False)
    op.create_index(op.f('ix_graph_edges_type'), 'graph_edges', ['type'], unique=False)

def downgrade() -> None:
    op.drop_table('graph_edges')
    op.drop_table('graph_nodes')
    op.drop_table('jobs')
    op.drop_table('pull_requests')
    op.drop_table('integrations')
    op.drop_table('memory_recalls')
    op.drop_table('metrics_daily')
    op.drop_table('learning_events')
    op.drop_table('rejected_patterns')
    op.drop_table('review_comments')
    op.drop_table('reviews')
    op.drop_table('incident_steps')
    op.drop_table('incidents')

