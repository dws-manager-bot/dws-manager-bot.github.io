"""How long each member was online during a conquest

Revision ID: f2b8c61d4a93
Revises: e3a91c5f7d20
Create Date: 2026-10-04

One nullable column on attendance_records; nothing existing changes meaning.
Null means it was never worked out for that day, which is not the same as zero.
"""
from alembic import op
import sqlalchemy as sa


revision = 'f2b8c61d4a93'
down_revision = 'e3a91c5f7d20'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('attendance_records',
                  sa.Column('online_minutes', sa.SmallInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column('attendance_records', 'online_minutes')
