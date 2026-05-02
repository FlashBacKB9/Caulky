"""investment fund linked to movement_type; purchases as movement supplements

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-05-01 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add movement_type_id to investment_funds
    op.add_column('investment_funds',
        sa.Column('movement_type_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_inv_fund_movement_type',
        'investment_funds', 'movement_types',
        ['movement_type_id'], ['id'],
        ondelete='SET NULL',
    )

    # Replace investment_purchases with a supplement table keyed by movement_id
    op.drop_table('investment_purchases')
    op.create_table(
        'investment_purchases',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('movement_id', sa.Integer(), nullable=False),
        sa.Column('price_at_purchase', sa.Numeric(14, 4), nullable=True),
        sa.Column('units', sa.Numeric(14, 6), nullable=True),
        sa.ForeignKeyConstraint(['movement_id'], ['movements.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('movement_id'),
    )
    op.create_index('ix_inv_purchases_movement_id', 'investment_purchases', ['movement_id'])


def downgrade() -> None:
    op.drop_index('ix_inv_purchases_movement_id', 'investment_purchases')
    op.drop_table('investment_purchases')
    op.drop_constraint('fk_inv_fund_movement_type', 'investment_funds', type_='foreignkey')
    op.drop_column('investment_funds', 'movement_type_id')
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
