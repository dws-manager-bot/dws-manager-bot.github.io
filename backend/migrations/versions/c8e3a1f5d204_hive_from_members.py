"""The hive map from the member table

Revision ID: c8e3a1f5d204
Revises: b6d2f48a1c93
Create Date: 2026-10-19

Two columns on players (the outermost flag and the stick group the hive map used
to read from a Google Sheet) and a table for the picture members are shown.
Nothing existing changes meaning.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'c8e3a1f5d204'
down_revision = 'b6d2f48a1c93'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('players', sa.Column('hive_outermost', sa.Boolean(), server_default=sa.false(),
                                       nullable=False))
    op.add_column('players', sa.Column('hive_group', sa.String(40), nullable=True))
    op.create_table(
        'hive_maps',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('applied_at', sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
        sa.Column('applied_by_id', sa.BigInteger(), nullable=True),
        sa.Column('applied_by_name', sa.String(100), nullable=True),
        sa.Column('png', sa.LargeBinary(), nullable=False),
        sa.Column('shelters', sa.Integer(), nullable=False),
        sa.Column('options', postgresql.JSONB(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('hive_maps')
    op.drop_column('players', 'hive_group')
    op.drop_column('players', 'hive_outermost')
