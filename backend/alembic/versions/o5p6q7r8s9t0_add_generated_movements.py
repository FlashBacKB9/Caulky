"""add generated_movements to tickets

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa

revision = 'o5p6q7r8s9t0'
down_revision = 'n4o5p6q7r8s9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tickets', sa.Column('generated_movements', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('tickets', 'generated_movements')
