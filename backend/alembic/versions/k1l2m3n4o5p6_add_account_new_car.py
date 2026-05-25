"""add account new_car flag

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-05-25
"""
from alembic import op
import sqlalchemy as sa

revision = 'k1l2m3n4o5p6'
down_revision = 'j0k1l2m3n4o5'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('accounts', sa.Column('new_car', sa.Boolean, nullable=False, server_default='false'))


def downgrade():
    op.drop_column('accounts', 'new_car')
