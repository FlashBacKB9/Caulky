"""add investments tables

Revision ID: d4e5f6a7b8c9
Revises: c3f1a2b4d5e6
Create Date: 2026-05-01 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3f1a2b4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'investment_funds',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('ticker', sa.String(50), nullable=True),
        sa.Column('color', sa.String(20), nullable=False, server_default='#6366f1'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('current_price', sa.Numeric(14, 4), nullable=True),
        sa.Column('current_value_override', sa.Numeric(14, 2), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'investment_purchases',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('fund_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('amount_eur', sa.Numeric(12, 2), nullable=False),
        sa.Column('price_at_purchase', sa.Numeric(14, 4), nullable=True),
        sa.Column('units', sa.Numeric(14, 6), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['fund_id'], ['investment_funds.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_investment_purchases_fund_id', 'investment_purchases', ['fund_id'])
    op.create_index('ix_investment_purchases_date',    'investment_purchases', ['date'])


def downgrade() -> None:
    op.drop_table('investment_purchases')
    op.drop_table('investment_funds')
