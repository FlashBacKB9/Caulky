"""add auth: users, oauth_accounts, user_id on all tables

Revision ID: c9d8e7f6a5b4
Revises: b1c2d3e4f5a6
Create Date: 2026-05-04

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c9d8e7f6a5b4'
down_revision: Union[str, Sequence[str], None] = 'b1c2d3e4f5a6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────────
    op.create_table(
        'users',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('email', sa.String(320), nullable=False),
        sa.Column('hashed_password', sa.String(1024), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_superuser', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_verified', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('display_name', sa.String(200), nullable=True),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    # ── oauth_accounts ─────────────────────────────────────────────────────────
    op.create_table(
        'oauth_accounts',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('oauth_name', sa.String(100), nullable=False),
        sa.Column('access_token', sa.String(1024), nullable=False),
        sa.Column('expires_at', sa.Integer(), nullable=True),
        sa.Column('refresh_token', sa.String(1024), nullable=True),
        sa.Column('account_id', sa.String(320), nullable=False),
        sa.Column('account_email', sa.String(320), nullable=True),
    )
    op.create_index('ix_oauth_accounts_account_id', 'oauth_accounts', ['account_id'])
    op.create_index('ix_oauth_accounts_oauth_name', 'oauth_accounts', ['oauth_name'])
    op.create_index('ix_oauth_accounts_user_id', 'oauth_accounts', ['user_id'])

    # ── user_id on data tables (nullable — existing rows are "unclaimed") ──────
    for table in ['income_expense_groups', 'movement_types', 'movements', 'accounts', 'investment_funds']:
        op.add_column(table, sa.Column(
            'user_id', sa.Uuid(),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=True,
        ))
        op.create_index(f'ix_{table}_user_id', table, ['user_id'])


def downgrade() -> None:
    for table in ['investment_funds', 'accounts', 'movements', 'movement_types', 'income_expense_groups']:
        op.drop_index(f'ix_{table}_user_id', table_name=table)
        op.drop_column(table, 'user_id')

    op.drop_index('ix_oauth_accounts_user_id', table_name='oauth_accounts')
    op.drop_index('ix_oauth_accounts_oauth_name', table_name='oauth_accounts')
    op.drop_index('ix_oauth_accounts_account_id', table_name='oauth_accounts')
    op.drop_table('oauth_accounts')

    op.drop_index('ix_users_email', table_name='users')
    op.drop_table('users')
