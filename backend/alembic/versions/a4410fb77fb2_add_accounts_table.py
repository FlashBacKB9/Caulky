"""add accounts table

Revision ID: a4410fb77fb2
Revises: 764e136c99da
Create Date: 2026-04-30 15:19:20.816656

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4410fb77fb2'
down_revision: Union[str, Sequence[str], None] = '764e136c99da'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('accounts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('color', sa.String(length=20), nullable=False, server_default='#6b7280'),
        sa.Column('icon', sa.String(length=50), nullable=False, server_default='wallet'),
        sa.Column('initial_balance', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_main', sa.Boolean(), nullable=False, server_default='false'),
        sa.PrimaryKeyConstraint('id')
    )
    op.add_column('movements',
        sa.Column('account_id', sa.Integer(), sa.ForeignKey('accounts.id'), nullable=True)
    )
    op.add_column('movement_types',
        sa.Column('linked_account_id', sa.Integer(), sa.ForeignKey('accounts.id'), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('movement_types', 'linked_account_id')
    op.drop_column('movements', 'account_id')
    op.drop_table('accounts')
