"""add real_accounts table

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = 'q7r8s9t0u1v2'
down_revision = 'p6q7r8s9t0u1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'real_accounts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('entity_name', sa.String(100), nullable=False),
        sa.Column('account_number', sa.String(50), nullable=True),
        sa.Column('color', sa.String(20), nullable=False, server_default='#6b7280'),
        sa.Column('user_id', sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_real_accounts_user_id', 'real_accounts', ['user_id'])

    op.create_table(
        'real_account_accounts',
        sa.Column('real_account_id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['real_account_id'], ['real_accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('real_account_id', 'account_id'),
    )


def downgrade() -> None:
    op.drop_table('real_account_accounts')
    op.drop_index('ix_real_accounts_user_id', table_name='real_accounts')
    op.drop_table('real_accounts')
