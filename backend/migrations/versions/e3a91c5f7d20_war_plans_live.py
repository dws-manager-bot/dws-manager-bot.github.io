"""War plans: shared drafts and Discord posts

Revision ID: e3a91c5f7d20
Revises: 5c1d83f6ba27
Create Date: 2026-09-29

Three nullable-or-defaulted columns on war_plans; nothing existing changes
meaning. `shared` opens a draft to every admin for live editing; `posted_at`
and `posted_url` remember the official plan's last Discord post.
"""
from alembic import op
import sqlalchemy as sa


revision = 'e3a91c5f7d20'
down_revision = '5c1d83f6ba27'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('war_plans', sa.Column('shared', sa.Boolean(), nullable=False,
                                         server_default=sa.false()))
    op.add_column('war_plans', sa.Column('posted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('war_plans', sa.Column('posted_url', sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column('war_plans', 'posted_url')
    op.drop_column('war_plans', 'posted_at')
    op.drop_column('war_plans', 'shared')
