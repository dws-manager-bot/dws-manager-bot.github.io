"""Which reward tier each member falls in

Revision ID: 5c1d83f6ba27
Revises: d7e2a4c90b16
Create Date: 2026-09-29

The game hands seasonal rewards out in four fixed bands and the sizes are its,
not ours: one leader, eight backbone, thirty key players, and the rest
contributors. Only the first three are recorded -- a member with no row is a
contributor, because that band is the remainder rather than a choice.
"""
from alembic import op
import sqlalchemy as sa


revision = '5c1d83f6ba27'
down_revision = 'd7e2a4c90b16'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'season_awards',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('season', sa.String(length=16), nullable=False),
        sa.Column('player_id', sa.Uuid(), nullable=False),
        sa.Column('tier', sa.String(length=16), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['player_id'], ['players.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('season', 'player_id', name='uq_season_award'),
    )
    op.create_index(op.f('ix_season_awards_season'), 'season_awards', ['season'])
    op.create_index(op.f('ix_season_awards_player_id'), 'season_awards', ['player_id'])


def downgrade() -> None:
    op.drop_table('season_awards')
