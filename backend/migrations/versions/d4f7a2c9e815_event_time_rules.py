"""Alternating start times, and a different start on given weekdays

Revision ID: d4f7a2c9e815
Revises: c8e3a1f5d204
Create Date: 2026-11-15

Two nullable columns on event_definitions. Null keeps today's behavior: one
start time, every run.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = 'd4f7a2c9e815'
down_revision = 'c8e3a1f5d204'
branch_labels = None
depends_on = None


def upgrade() -> None:
    for column in ('alternate_times', 'weekday_times'):
        op.add_column('event_definitions', sa.Column(column, postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column('event_definitions', 'weekday_times')
    op.drop_column('event_definitions', 'alternate_times')
