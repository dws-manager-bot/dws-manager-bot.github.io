"""Who turned out for a season's events

Revision ID: b4f21c8d05e7
Revises: e1b7402fd539
Create Date: 2026-09-29

Seasonal rewards are handed out in tiers, so they need a record of who actually
showed up rather than a memory of it. Strife Pass Conquest is the first kind;
`kind` is a plain string so the next needs no migration.
"""
from alembic import op
import sqlalchemy as sa


revision = 'b4f21c8d05e7'
down_revision = 'e1b7402fd539'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'attendance_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=32), nullable=False),
        sa.Column('held_on', sa.Date(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('kind', 'held_on', name='uq_attendance_event'),
    )
    op.create_index(op.f('ix_attendance_events_kind'), 'attendance_events', ['kind'])
    op.create_table(
        'attendance_records',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('event_id', sa.Integer(), nullable=False),
        sa.Column('player_id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('present', sa.Boolean(), nullable=False),
        # Null is not zero: it means the ranking was never captured that day.
        sa.Column('merits', sa.BigInteger(), nullable=True),
        sa.Column('rank', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['event_id'], ['attendance_events.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['player_id'], ['players.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('event_id', 'player_id', name='uq_attendance_record'),
    )
    op.create_index(op.f('ix_attendance_records_event_id'), 'attendance_records', ['event_id'])
    op.create_index(op.f('ix_attendance_records_player_id'), 'attendance_records', ['player_id'])


def downgrade() -> None:
    op.drop_table('attendance_records')
    op.drop_index(op.f('ix_attendance_events_kind'), table_name='attendance_events')
    op.drop_table('attendance_events')
