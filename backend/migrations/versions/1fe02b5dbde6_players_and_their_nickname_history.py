"""players and their nickname history

Revision ID: 1fe02b5dbde6
Revises: fe2f60025e83
Create Date: 2026-09-23 00:24:26

Purely additive: two new tables, nothing existing is touched. `gen_random_uuid()`
is built into PostgreSQL 13 and later, so no extension is needed.

Production got both tables by hand on 2026-09-23, from this exact DDL, ahead of
the code that uses them. alembic_version was deliberately left at fe2f60025e83:
bumping it would have made the deployed image, which runs `alembic upgrade head`
before starting, fail on a revision it has never heard of. So on that database
this migration finds the tables already there and only records the revision.
"""
from __future__ import annotations

from alembic import context, op
import sqlalchemy as sa


revision = '1fe02b5dbde6'
down_revision = 'fe2f60025e83'
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not context.is_offline_mode() and sa.inspect(op.get_bind()).has_table('players'):
        return

    op.create_table('players',
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('rank', sa.Integer(), nullable=True),
    sa.Column('industry_level', sa.Integer(), nullable=True),
    sa.Column('bgb_cp', sa.BigInteger(), nullable=True),
    sa.Column('total_cp', sa.BigInteger(), nullable=True),
    sa.Column('active', sa.Boolean(), server_default=sa.true(), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_players_name'), 'players', ['name'], unique=False)

    op.create_table('player_names',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('player_id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('first_seen', sa.Date(), nullable=True),
    sa.Column('last_seen', sa.Date(), nullable=True),
    sa.ForeignKeyConstraint(['player_id'], ['players.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('player_id', 'name', name='uq_player_name')
    )
    op.create_index(op.f('ix_player_names_name'), 'player_names', ['name'], unique=False)
    op.create_index(op.f('ix_player_names_player_id'), 'player_names', ['player_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_player_names_player_id'), table_name='player_names')
    op.drop_index(op.f('ix_player_names_name'), table_name='player_names')
    op.drop_table('player_names')
    op.drop_index(op.f('ix_players_name'), table_name='players')
    op.drop_table('players')
