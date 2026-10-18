"""The six parts of a player's total CP, and the game's own id for them

Revision ID: b6d2f48a1c93
Revises: a3d58e90c7b1
Create Date: 2026-10-18

Nine nullable columns on players; nothing existing changes meaning. Null means no
member scan has read that player yet, which is not the same as zero. game_uid is
unique, and Postgres lets any number of rows leave it null.
"""
from alembic import op
import sqlalchemy as sa


revision = 'b6d2f48a1c93'
down_revision = 'a3d58e90c7b1'
branch_labels = None
depends_on = None

PARTS = ('structure_cp', 'tech_cp', 'troop_cp', 'hero_cp', 'mod_vehicle_cp',
         'pet_agent_cp', 'peak_cp')


def upgrade() -> None:
    op.add_column('players', sa.Column('game_uid', sa.String(32), nullable=True))
    op.create_unique_constraint('uq_players_game_uid', 'players', ['game_uid'])
    for col in PARTS:
        op.add_column('players', sa.Column(col, sa.BigInteger(), nullable=True))
    op.add_column('players', sa.Column('cp_read_on', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('players', 'cp_read_on')
    for col in reversed(PARTS):
        op.drop_column('players', col)
    op.drop_constraint('uq_players_game_uid', 'players', type_='unique')
    op.drop_column('players', 'game_uid')
