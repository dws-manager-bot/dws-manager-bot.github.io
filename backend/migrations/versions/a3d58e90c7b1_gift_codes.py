"""Gift codes, and who has redeemed which

Revision ID: a3d58e90c7b1
Revises: f2b8c61d4a93
Create Date: 2026-10-18

Four nullable or defaulted columns on app_users, so no existing row changes
meaning: the account's in-game id, the login token the gift-code site checks
beside it, when the site last refused that token, and whether the person wants
their codes redeemed for them.

gift_codes is the codes themselves. gift_code_redemptions is one row per account
per code, and is what keeps the redeemer from calling the site for the same pair
twice.
"""
from alembic import op
import sqlalchemy as sa


revision = 'a3d58e90c7b1'
down_revision = 'f2b8c61d4a93'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('app_users', sa.Column('game_uid', sa.String(length=20), nullable=True))
    op.add_column('app_users', sa.Column('game_uuid', sa.String(length=64), nullable=True))
    op.add_column('app_users',
                  sa.Column('game_login_failed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('app_users',
                  sa.Column('auto_redeem', sa.Boolean(), server_default=sa.false(),
                            nullable=False))
    op.create_index(op.f('ix_app_users_game_uid'), 'app_users', ['game_uid'], unique=True)

    op.create_table(
        'gift_codes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=64), nullable=False),
        sa.Column('status', sa.String(length=16), server_default='active', nullable=False),
        sa.Column('source', sa.String(length=16), server_default='manual', nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('closed_response', sa.String(length=200), nullable=True),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by_id', sa.BigInteger(), nullable=True),
        sa.Column('created_by_name', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_gift_codes_code'), 'gift_codes', ['code'], unique=True)

    op.create_table(
        'gift_code_redemptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('state', sa.String(length=16), nullable=False),
        sa.Column('attempts', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('response', sa.String(length=200), nullable=True),
        sa.Column('last_attempt_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['code_id'], ['gift_codes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['app_users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code_id', 'user_id', name='uq_redemption_pair'),
    )
    op.create_index(op.f('ix_gift_code_redemptions_code_id'), 'gift_code_redemptions',
                    ['code_id'], unique=False)
    op.create_index(op.f('ix_gift_code_redemptions_user_id'), 'gift_code_redemptions',
                    ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_gift_code_redemptions_user_id'), table_name='gift_code_redemptions')
    op.drop_index(op.f('ix_gift_code_redemptions_code_id'), table_name='gift_code_redemptions')
    op.drop_table('gift_code_redemptions')
    op.drop_index(op.f('ix_gift_codes_code'), table_name='gift_codes')
    op.drop_table('gift_codes')
    op.drop_index(op.f('ix_app_users_game_uid'), table_name='app_users')
    op.drop_column('app_users', 'auto_redeem')
    op.drop_column('app_users', 'game_login_failed_at')
    op.drop_column('app_users', 'game_uuid')
    op.drop_column('app_users', 'game_uid')
