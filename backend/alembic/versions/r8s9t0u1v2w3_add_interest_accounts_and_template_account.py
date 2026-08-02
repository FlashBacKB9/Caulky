"""add interest-bearing account fields and template account_id

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-08-02
"""
from alembic import op
import sqlalchemy as sa

revision = 'r8s9t0u1v2w3'
down_revision = 'q7r8s9t0u1v2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Cuentas remuneradas: marca la cuenta y el subtipo con el que se abonan los intereses
    op.add_column('accounts', sa.Column('interest_enabled', sa.Boolean, nullable=False, server_default='false'))
    # Sin FK a propósito: si se borra el subtipo, la cuenta no debe bloquear el borrado
    op.add_column('accounts', sa.Column('interest_type_id', sa.Integer, nullable=True))
    # Retención aplicada al abono (0.19 = 19%). El banco ingresa el interés ya neto.
    op.add_column('accounts', sa.Column('interest_tax_rate', sa.Numeric(5, 4), nullable=True))

    # Plantillas: cuenta a la que se asigna el movimiento generado
    op.add_column('movement_templates', sa.Column('account_id', sa.Integer, nullable=True))


def downgrade() -> None:
    op.drop_column('movement_templates', 'account_id')
    op.drop_column('accounts', 'interest_tax_rate')
    op.drop_column('accounts', 'interest_type_id')
    op.drop_column('accounts', 'interest_enabled')
