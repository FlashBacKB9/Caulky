"""add shared fields to movements

Revision ID: b1c2d3e4f5a6
Revises: a4410fb77fb2
Create Date: 2026-05-03 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, Sequence[str], None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('movements', sa.Column('is_shared', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('movements', sa.Column('shared_between', sa.Integer(), nullable=True))
    op.add_column('movements', sa.Column('my_share', sa.Numeric(precision=12, scale=2), nullable=True))


def downgrade() -> None:
    op.drop_column('movements', 'my_share')
    op.drop_column('movements', 'shared_between')
    op.drop_column('movements', 'is_shared')
