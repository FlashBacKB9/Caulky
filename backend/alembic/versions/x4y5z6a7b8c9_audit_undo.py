"""historial de actividad con deshacer: fila entera, operación y marca de deshecho

Revision ID: x4y5z6a7b8c9
Revises: w3x4y5z6a7b8
Create Date: 2026-11-15

Las entradas que ya había no tienen `group_id`: se siguen viendo, pero no se pueden
deshacer porque no guardaron la fila entera.
"""
from alembic import op
import sqlalchemy as sa

revision = 'x4y5z6a7b8c9'
down_revision = 'w3x4y5z6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('audit_logs', sa.Column('group_id', sa.String(36), nullable=True))
    op.add_column('audit_logs', sa.Column('table_name', sa.String(64), nullable=True))
    op.add_column('audit_logs', sa.Column('row_id', sa.String(200), nullable=True))
    op.add_column('audit_logs', sa.Column('restored_at', sa.DateTime(), nullable=True))
    op.create_index('ix_audit_logs_group_id', 'audit_logs', ['group_id'])
    op.create_index('ix_audit_logs_table_row', 'audit_logs', ['table_name', 'row_id'])


def downgrade() -> None:
    op.drop_index('ix_audit_logs_table_row', table_name='audit_logs')
    op.drop_index('ix_audit_logs_group_id', table_name='audit_logs')
    op.drop_column('audit_logs', 'restored_at')
    op.drop_column('audit_logs', 'row_id')
    op.drop_column('audit_logs', 'table_name')
    op.drop_column('audit_logs', 'group_id')
