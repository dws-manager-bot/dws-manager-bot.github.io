"""Which game season each attendance event counts towards

Revision ID: c3e8a1f5d904
Revises: d7f2a9c41e85
Create Date: 2026-11-29

Every event recorded so far is a season 5 Strife Pass conquest, so the column
arrives as 5 for all of them and the season 5 page reads exactly as before.
"""
from alembic import op
import sqlalchemy as sa


revision = 'c3e8a1f5d904'
down_revision = 'd7f2a9c41e85'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('attendance_events',
                  sa.Column('season', sa.SmallInteger(), nullable=False, server_default='5'))
    op.create_index('ix_attendance_events_season', 'attendance_events', ['season'])


def downgrade() -> None:
    op.drop_index('ix_attendance_events_season', table_name='attendance_events')
    op.drop_column('attendance_events', 'season')
