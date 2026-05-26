"""add is_transfer and from_account_id to movements

Revision ID: l2m3n4o5p6q7
Revises: k1l2m3n4o5p6
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa

revision = 'l2m3n4o5p6q7'
down_revision = 'k1l2m3n4o5p6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('movements', sa.Column('is_transfer', sa.Boolean, nullable=False, server_default='false'))
    op.add_column('movements', sa.Column('from_account_id', sa.Integer, sa.ForeignKey('accounts.id'), nullable=True))


def downgrade():
    op.drop_column('movements', 'from_account_id')
    op.drop_column('movements', 'is_transfer')
