"""The Discord thread a battle's cards were posted to

Revision ID: e1b7402fd539
Revises: c58e1a97f204
Create Date: 2026-09-26

Kept so the button can link to the thread, and warn before making a second one:
a post to a channel the whole alliance reads is not undoable.
"""
from alembic import op
import sqlalchemy as sa


revision = 'e1b7402fd539'
down_revision = 'c58e1a97f204'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('bgb_events', sa.Column('thread_id', sa.BigInteger(), nullable=True))
    op.add_column('bgb_events',
                  sa.Column('published_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('bgb_events', 'published_at')
    op.drop_column('bgb_events', 'thread_id')
