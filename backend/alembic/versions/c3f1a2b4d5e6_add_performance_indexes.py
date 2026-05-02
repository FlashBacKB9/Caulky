"""add performance indexes

Revision ID: c3f1a2b4d5e6
Revises: a4410fb77fb2
Create Date: 2026-05-01 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op


revision: str = 'c3f1a2b4d5e6'
down_revision: Union[str, Sequence[str], None] = 'a4410fb77fb2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('ix_movements_date',             'movements',      ['date'])
    op.create_index('ix_movements_movement_type_id', 'movements',      ['movement_type_id'])
    op.create_index('ix_movements_account_id',       'movements',      ['account_id'])
    op.create_index('ix_mt_income_expense_group_id', 'movement_types', ['income_expense_group_id'])
    op.create_index('ix_mt_linked_account_id',       'movement_types', ['linked_account_id'])


def downgrade() -> None:
    op.drop_index('ix_movements_date',             table_name='movements')
    op.drop_index('ix_movements_movement_type_id', table_name='movements')
    op.drop_index('ix_movements_account_id',       table_name='movements')
    op.drop_index('ix_mt_income_expense_group_id', table_name='movement_types')
    op.drop_index('ix_mt_linked_account_id',       table_name='movement_types')
