"""add credit card accounts

Revision ID: t0u1v2w3x4y5
Revises: s9t0u1v2w3x4
Create Date: 2026-10-07
"""
from alembic import op
import sqlalchemy as sa

revision = 't0u1v2w3x4y5'
down_revision = 's9t0u1v2w3x4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Tarjetas de crédito: tope, día de corte, día de cargo y cuenta que paga la liquidación
    op.add_column('accounts', sa.Column('credit_limit', sa.Numeric(12, 2), nullable=True))
    op.add_column('accounts', sa.Column('credit_cutoff_day', sa.Integer, nullable=True))
    op.add_column('accounts', sa.Column('credit_charge_day', sa.Integer, nullable=True))
    # Sin FK a propósito, como interest_type_id: borrar la cuenta pagadora no debe bloquearse
    op.add_column('accounts', sa.Column('credit_pay_account_id', sa.Integer, nullable=True))
    op.add_column('accounts', sa.Column('credit_auto_charge', sa.Boolean, nullable=False, server_default='true'))
    # Último corte ya liquidado: las compras hasta esa fecha ya están cobradas
    op.add_column('accounts', sa.Column('credit_last_cycle_end', sa.Date, nullable=True))

    # Liquidación: fecha de corte del ciclo que cobra este traspaso
    op.add_column('movements', sa.Column('credit_cycle_end', sa.Date, nullable=True))


def downgrade() -> None:
    op.drop_column('movements', 'credit_cycle_end')
    op.drop_column('accounts', 'credit_last_cycle_end')
    op.drop_column('accounts', 'credit_auto_charge')
    op.drop_column('accounts', 'credit_pay_account_id')
    op.drop_column('accounts', 'credit_charge_day')
    op.drop_column('accounts', 'credit_cutoff_day')
    op.drop_column('accounts', 'credit_limit')
