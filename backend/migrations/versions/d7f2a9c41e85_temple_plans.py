"""temple_plans: Temple Strife drafts and the official plan

Revision ID: d7f2a9c41e85
Revises: b6d1e4a7c902
Create Date: 2026-11-28

A new table; nothing existing changes.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'd7f2a9c41e85'
down_revision = 'b6d1e4a7c902'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'temple_plans',
        sa.Column('slug', sa.String(length=64), nullable=False),
        sa.Column('owner_id', sa.BigInteger(), nullable=True),
        sa.Column('owner_name', sa.String(length=100), nullable=True),
        sa.Column('title', sa.String(length=80), nullable=True),
        sa.Column('plan', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('updated_by_id', sa.BigInteger(), nullable=True),
        sa.Column('updated_by_name', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('slug'),
    )
    op.create_index('ix_temple_plans_owner_id', 'temple_plans', ['owner_id'])


def downgrade() -> None:
    op.drop_index('ix_temple_plans_owner_id', table_name='temple_plans')
    op.drop_table('temple_plans')
