"""A BGB seat may be a mercenary, who is nobody's player

Revision ID: a9d47c1e3b60
Revises: 7b3c9d41a028
Create Date: 2026-09-25

Mercenaries are hired from another alliance for one battle. They take a real
seat and belong on the card, but they must not be members: the member import
reads an absent row as somebody who left, and a mercenary was never here to
leave. So the seat points at no player, and carries their name and CP itself.
"""
from alembic import op
import sqlalchemy as sa


revision = 'a9d47c1e3b60'
down_revision = '7b3c9d41a028'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('bgb_registrations', 'player_id',
                    existing_type=sa.Uuid(), nullable=True)


def downgrade() -> None:
    # Nothing can point at a player it never had, so the mercenaries go.
    op.execute(sa.text("DELETE FROM bgb_registrations WHERE player_id IS NULL"))
    op.alter_column('bgb_registrations', 'player_id',
                    existing_type=sa.Uuid(), nullable=False)
