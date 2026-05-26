"""add tickets table

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa

revision = 'm3n4o5p6q7r8'
down_revision = 'l2m3n4o5p6q7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'tickets',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('user_id', sa.Uuid, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('original_name', sa.String(500), nullable=False),
        sa.Column('filename', sa.String(500), nullable=False),
        sa.Column('mime_type', sa.String(100), nullable=False),
        sa.Column('store_name', sa.String(300), nullable=True),
        sa.Column('ticket_date', sa.Date, nullable=True),
        sa.Column('total', sa.Float, nullable=True),
        sa.Column('items', sa.Text, nullable=False, server_default='[]'),
        sa.Column('categories', sa.Text, nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime, server_default=sa.text('now()'), nullable=False),
    )


def downgrade():
    op.drop_table('tickets')
