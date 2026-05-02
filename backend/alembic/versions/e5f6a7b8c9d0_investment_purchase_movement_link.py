"""link investment_purchases to movements

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-05-01 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('investment_purchases',
        sa.Column('movement_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_inv_purchase_movement',
        'investment_purchases', 'movements',
        ['movement_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_inv_purchase_movement', 'investment_purchases', type_='foreignkey')
    op.drop_column('investment_purchases', 'movement_id')
