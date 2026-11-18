"""Armor CP, a seventh part of total CP

Revision ID: e5a8c3b1f706
Revises: d4f7a2c9e815
Create Date: 2026-11-18

The game's profile response gained `armorPower` by the 11-18 scan; without it the
other six parts fall short of total CP. Nullable: null means not read yet.
"""
from alembic import op
import sqlalchemy as sa


revision = 'e5a8c3b1f706'
down_revision = 'd4f7a2c9e815'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('players', sa.Column('armor_cp', sa.BigInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column('players', 'armor_cp')
