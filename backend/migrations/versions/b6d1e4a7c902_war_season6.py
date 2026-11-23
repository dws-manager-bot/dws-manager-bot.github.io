"""war planner season 6: destroyed Fortresses and Temple results

Revision ID: b6d1e4a7c902
Revises: e5a8c3b1f706
Create Date: 2026-11-24 01:10:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'b6d1e4a7c902'
down_revision = 'e5a8c3b1f706'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('war_holdings', sa.Column('destroyed', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.create_table(
        'war_temple_results',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('season', sa.Integer(), nullable=False),
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('city_id', sa.Integer(), nullable=False),
        sa.Column('camp', sa.Integer(), nullable=False),
        sa.Column('rank', sa.Integer(), nullable=True),
        sa.Column('mithril', sa.Integer(), nullable=False),
        sa.Column('notes', sa.String(length=200), nullable=True),
        sa.Column('created_by_id', sa.BigInteger(), nullable=True),
        sa.Column('created_by_name', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_war_temple_results_season'), 'war_temple_results', ['season'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_war_temple_results_season'), table_name='war_temple_results')
    op.drop_table('war_temple_results')
    op.drop_column('war_holdings', 'destroyed')
