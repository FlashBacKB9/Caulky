"""Comprobación de que los IDs que llegan en una petición son del usuario.

Sin ella, un usuario podría apuntar su movimiento, tipo, cuenta o plantilla a un tipo, grupo
o cuenta de otro: vería su nombre o color, le bloquearía borrados (la clave foránea lo impide)
o le alteraría cálculos.
"""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.income_expense_group import IncomeExpenseGroup
from app.models.movement_type import MovementType

# Campo → tabla a la que apunta
FK_FIELDS = {
    "movement_type_id": MovementType,
    "interest_type_id": MovementType,
    "type_id": MovementType,
    "account_id": Account,
    "from_account_id": Account,
    "linked_account_id": Account,
    "credit_pay_account_id": Account,
    "income_expense_group_id": IncomeExpenseGroup,
    "group_id": IncomeExpenseGroup,
}


async def owns(db: AsyncSession, model, obj_id, user_id) -> bool:
    return (await db.execute(
        select(model.id).where(model.id == obj_id, model.user_id == user_id)
    )).first() is not None


async def ensure_owned(db: AsyncSession, user_id, data: dict) -> None:
    """400 si algún campo de clave foránea de `data` apunta a algo que no es del usuario."""
    for field, model in FK_FIELDS.items():
        value = data.get(field)
        if value in (None, "") or isinstance(value, bool):
            continue
        try:
            obj_id = int(value)
        except (TypeError, ValueError):
            raise HTTPException(400, f"{field} no válido")
        if not await owns(db, model, obj_id, user_id):
            raise HTTPException(400, f"{field} no válido")
