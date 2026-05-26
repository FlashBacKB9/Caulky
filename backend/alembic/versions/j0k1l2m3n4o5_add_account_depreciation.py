"""add account depreciation fields

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-05-25
"""
from alembic import op
import sqlalchemy as sa

revision = 'j0k1l2m3n4o5'
down_revision = 'i9j0k1l2m3n4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('accounts', sa.Column('depreciation_rate', sa.Numeric(6, 4), nullable=True))
    op.add_column('accounts', sa.Column('value_date', sa.Date, nullable=True))


def downgrade():
    op.drop_column('accounts', 'value_date')
    op.drop_column('accounts', 'depreciation_rate')
