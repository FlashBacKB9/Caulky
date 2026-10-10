"""add app_settings (ajustes de toda la instalación)

Revision ID: w3x4y5z6a7b8
Revises: v2w3x4y5z6a7
Create Date: 2026-10-10
"""
from alembic import op
import sqlalchemy as sa

revision = 'w3x4y5z6a7b8'
down_revision = 'v2w3x4y5z6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'app_settings',
        sa.Column('key', sa.String(100), primary_key=True),
        sa.Column('value', sa.Text, nullable=False),
    )


def downgrade() -> None:
    op.drop_table('app_settings')
