"""add movement_templates table

Revision ID: a1b2c3d4e5f6
Revises: c9d8e7f6a5b4
Create Date: 2026-05-06

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'c9d8e7f6a5b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'movement_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('label', sa.String(length=200), nullable=False),
        sa.Column('name', sa.String(length=500), nullable=False, server_default=''),
        sa.Column('money', sa.String(length=50), nullable=False, server_default='0'),
        sa.Column('date_mode', sa.String(length=20), nullable=False, server_default='today'),
        sa.Column('bank_date_mode', sa.String(length=20), nullable=False, server_default='manual'),
        sa.Column('movement_type_id', sa.Integer(), nullable=True),
        sa.Column('paid', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('no_count', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('notes', sa.String(length=2000), nullable=False, server_default=''),
        sa.Column('recurrence', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_movement_templates_user_id'), 'movement_templates', ['user_id']
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_movement_templates_user_id'), table_name='movement_templates')
    op.drop_table('movement_templates')
