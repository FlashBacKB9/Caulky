"""add ocr_source to tickets

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa

revision = 'p6q7r8s9t0u1'
down_revision = 'o5p6q7r8s9t0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tickets', sa.Column('ocr_source', sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column('tickets', 'ocr_source')
