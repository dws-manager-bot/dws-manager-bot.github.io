"""War planner: alliances, the territory board, war days and plans

Revision ID: d7e2a4c90b16
Revises: b4f21c8d05e7
Create Date: 2026-09-29

All new tables; nothing existing changes. The season map itself is static game
data shipped with the frontend, so none of it is stored here.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'd7e2a4c90b16'
down_revision = 'b4f21c8d05e7'
branch_labels = None
depends_on = None


def _stamps():
    return [
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        'war_alliances',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('season', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=64), nullable=False),
        sa.Column('tag', sa.String(length=16), nullable=True),
        sa.Column('camp', sa.Integer(), nullable=False),
        sa.Column('color', sa.String(length=7), nullable=False),
        sa.Column('server', sa.String(length=16), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('updated_by_id', sa.BigInteger(), nullable=True),
        sa.Column('updated_by_name', sa.String(length=100), nullable=True),
        *_stamps(),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('season', 'name', name='uq_war_alliance_name'),
        sa.UniqueConstraint('season', 'color', name='uq_war_alliance_color'),
    )
    op.create_index(op.f('ix_war_alliances_season'), 'war_alliances', ['season'])

    op.create_table(
        'war_holdings',
        sa.Column('season', sa.Integer(), nullable=False),
        sa.Column('city_id', sa.Integer(), nullable=False),
        sa.Column('alliance_id', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_by_id', sa.BigInteger(), nullable=True),
        sa.Column('updated_by_name', sa.String(length=100), nullable=True),
        sa.ForeignKeyConstraint(['alliance_id'], ['war_alliances.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('season', 'city_id'),
    )
    op.create_index(op.f('ix_war_holdings_alliance_id'), 'war_holdings', ['alliance_id'])

    op.create_table(
        'war_days',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('season', sa.Integer(), nullable=False),
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('title', sa.String(length=80), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by_id', sa.BigInteger(), nullable=True),
        sa.Column('created_by_name', sa.String(length=100), nullable=True),
        *_stamps(),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('season', 'day', name='uq_war_day'),
    )
    op.create_index(op.f('ix_war_days_season'), 'war_days', ['season'])

    op.create_table(
        'war_plans',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('day_id', sa.Integer(), nullable=False),
        sa.Column('owner_id', sa.BigInteger(), nullable=True),
        sa.Column('owner_name', sa.String(length=100), nullable=True),
        sa.Column('doc', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('source_id', sa.Integer(), nullable=True),
        sa.Column('source_name', sa.String(length=100), nullable=True),
        sa.Column('updated_by_id', sa.BigInteger(), nullable=True),
        sa.Column('updated_by_name', sa.String(length=100), nullable=True),
        *_stamps(),
        sa.ForeignKeyConstraint(['day_id'], ['war_days.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('day_id', 'owner_id', name='uq_war_plan_owner'),
    )
    op.create_index(op.f('ix_war_plans_day_id'), 'war_plans', ['day_id'])
    # NULL owners are distinct to the unique constraint above, so "one official
    # plan per day" needs its own partial index.
    op.create_index('uq_war_plan_official', 'war_plans', ['day_id'], unique=True,
                    postgresql_where=sa.text('owner_id IS NULL'))


def downgrade() -> None:
    op.drop_index('uq_war_plan_official', table_name='war_plans')
    op.drop_index(op.f('ix_war_plans_day_id'), table_name='war_plans')
    op.drop_table('war_plans')
    op.drop_index(op.f('ix_war_days_season'), table_name='war_days')
    op.drop_table('war_days')
    op.drop_index(op.f('ix_war_holdings_alliance_id'), table_name='war_holdings')
    op.drop_table('war_holdings')
    op.drop_index(op.f('ix_war_alliances_season'), table_name='war_alliances')
    op.drop_table('war_alliances')
