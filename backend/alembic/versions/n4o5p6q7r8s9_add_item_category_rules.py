"""add item_category_rules table

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa

revision = 'n4o5p6q7r8s9'
down_revision = 'm3n4o5p6q7r8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'item_category_rules',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('user_id', sa.Uuid, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('item_name', sa.String(500), nullable=False),
        sa.Column('category', sa.String(200), nullable=False),
        sa.UniqueConstraint('user_id', 'item_name', name='uq_user_item_category'),
    )


def downgrade():
    op.drop_table('item_category_rules')
