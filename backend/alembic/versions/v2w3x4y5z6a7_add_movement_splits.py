"""add movement_splits (categoría múltiple)

Revision ID: v2w3x4y5z6a7
Revises: u1v2w3x4y5z6
Create Date: 2026-10-10
"""
from alembic import op
import sqlalchemy as sa

revision = 'v2w3x4y5z6a7'
down_revision = 'u1v2w3x4y5z6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'movement_splits',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('movement_id', sa.Integer, sa.ForeignKey('movements.id', ondelete='CASCADE'), nullable=False),
        sa.Column('movement_type_id', sa.Integer, sa.ForeignKey('movement_types.id', ondelete='CASCADE'), nullable=False),
        sa.Column('money', sa.Numeric(12, 2), nullable=False),
    )
    op.create_index('ix_movement_splits_movement_id', 'movement_splits', ['movement_id'])
    op.create_index('ix_movement_splits_movement_type_id', 'movement_splits', ['movement_type_id'])


def downgrade() -> None:
    op.drop_index('ix_movement_splits_movement_type_id', 'movement_splits')
    op.drop_index('ix_movement_splits_movement_id', 'movement_splits')
    op.drop_table('movement_splits')
