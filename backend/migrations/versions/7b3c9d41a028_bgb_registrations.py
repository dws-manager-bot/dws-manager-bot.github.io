"""Who was registered for which Black Gold Battlefield

Revision ID: 7b3c9d41a028
Revises: 1fe02b5dbde6
Create Date: 2026-09-25

One row per battle, and one per seat on it. Only the registered are recorded:
the roster is 20 starters and 10 substitutes a side, not the whole alliance.
"""
from alembic import op
import sqlalchemy as sa


revision = '7b3c9d41a028'
down_revision = '1fe02b5dbde6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'bgb_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('battle_date', sa.Date(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('battle_date'),
    )
    op.create_table(
        'bgb_registrations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('event_id', sa.Integer(), nullable=False),
        sa.Column('player_id', sa.Uuid(), nullable=False),
        sa.Column('team', sa.String(length=1), nullable=False),
        sa.Column('role', sa.String(length=16), nullable=False),
        # The name and CP the seat was drafted on, not today's. A card for a
        # past battle has to keep showing what it showed.
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('bgb_cp', sa.BigInteger(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['event_id'], ['bgb_events.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['player_id'], ['players.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('event_id', 'player_id', name='uq_bgb_seat'),
    )
    op.create_index(op.f('ix_bgb_registrations_event_id'), 'bgb_registrations',
                    ['event_id'], unique=False)
    op.create_index(op.f('ix_bgb_registrations_player_id'), 'bgb_registrations',
                    ['player_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_bgb_registrations_player_id'), table_name='bgb_registrations')
    op.drop_index(op.f('ix_bgb_registrations_event_id'), table_name='bgb_registrations')
    op.drop_table('bgb_registrations')
    op.drop_table('bgb_events')
