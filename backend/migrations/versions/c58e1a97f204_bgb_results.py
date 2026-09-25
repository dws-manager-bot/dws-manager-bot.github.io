"""What each registered player scored in the battle

Revision ID: c58e1a97f204
Revises: a9d47c1e3b60
Create Date: 2026-09-26

The result mail ranks everyone from both alliances by score. Only our own rows
matter, and they are matched to the seats already recorded for that battle.

`results_at` on the event is what tells "nobody fought" apart from "we have not
read the result yet", since both leave every score null.
"""
from alembic import op
import sqlalchemy as sa


revision = 'c58e1a97f204'
down_revision = 'a9d47c1e3b60'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('bgb_events',
                  sa.Column('results_at', sa.DateTime(timezone=True), nullable=True))
    # Null score with participated set means they were not in the ranking at
    # all; zero means the game listed them and they never fought.
    op.add_column('bgb_registrations', sa.Column('score', sa.BigInteger(), nullable=True))
    op.add_column('bgb_registrations', sa.Column('participated', sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column('bgb_registrations', 'participated')
    op.drop_column('bgb_registrations', 'score')
    op.drop_column('bgb_events', 'results_at')
