"""Categoría múltiple: un movimiento repartido entre varios tipos.

El movimiento guarda el importe total y, como `movement_type_id`, el tipo de la parte mayor;
así el signo, los saldos de cuenta y todo lo que mira solo el tipo siguen funcionando. Las
estadísticas por tipo reparten el movimiento con `split_parts`.

Reglas: todas las partes con el mismo signo, todas de ingreso o todas de gasto (el signo del
movimiento depende de eso) y ninguna con cuenta vinculada (moverían dinero entre cuentas).
"""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.movement import Movement
from app.models.movement_split import MovementSplit
from app.models.movement_type import MovementType


def split_parts(mv: Movement) -> list[tuple[int | None, float]]:
    """(tipo, importe) de cada parte; un movimiento normal es una sola parte."""
    if mv.splits:
        return [(s.movement_type_id, float(s.money)) for s in mv.splits]
    return [(mv.movement_type_id, float(mv.money))]


def _set_parts(mv: Movement, parts: dict[int, float]) -> None:
    if len(parts) == 1:
        (type_id, money), = parts.items()
        mv.movement_type_id, mv.money, mv.splits = type_id, money, []
        return
    mv.money = round(sum(parts.values()), 2)
    mv.movement_type_id = max(parts, key=lambda k: abs(parts[k]))
    mv.splits = [MovementSplit(movement_type_id=k, money=v) for k, v in parts.items()]


async def apply_splits(db: AsyncSession, user_id, mv: Movement, splits: list[dict]) -> None:
    """Valida y aplica las partes. Con una sola parte queda un movimiento normal; sin partes,
    solo se quita la división."""
    parts: dict[int, float] = {}
    for s in splits:
        tid = int(s["movement_type_id"])
        parts[tid] = parts.get(tid, 0.0) + float(s["money"])
    parts = {k: round(v, 2) for k, v in parts.items() if round(v, 2) != 0}
    if not parts:
        mv.splits = []
        return
    if len(parts) > 1 and (mv.is_transfer or mv.credit_cycle_end is not None):
        raise HTTPException(400, "Un traspaso no puede tener categoría múltiple")

    res = await db.execute(
        select(MovementType)
        .where(MovementType.id.in_(parts), MovementType.user_id == user_id)
        .options(selectinload(MovementType.income_expense_group))
    )
    types = res.scalars().all()
    if len(types) != len(parts):
        raise HTTPException(400, "Tipo de movimiento no válido")
    if len(parts) == 1:
        _set_parts(mv, parts)
        return
    if any(t.linked_account_id for t in types):
        raise HTTPException(400, "Un tipo con cuenta vinculada no puede ir en una categoría múltiple")
    if len({t.income_expense_group.name == "Ingreso" for t in types}) > 1:
        raise HTTPException(400, "No se pueden mezclar tipos de ingreso y de gasto")
    if len({v > 0 for v in parts.values()}) > 1:
        raise HTTPException(400, "Todas las partes deben tener el mismo signo")
    _set_parts(mv, parts)


def rescale_splits(mv: Movement, old_money: float) -> None:
    """Al cambiar solo el importe, las partes se escalan en proporción."""
    new_money = float(mv.money)
    if not mv.splits or old_money == 0:
        return
    ratio = new_money / old_money
    amounts = [round(float(s.money) * ratio, 2) for s in mv.splits]
    amounts[-1] = round(new_money - sum(amounts[:-1]), 2)
    for s, a in zip(mv.splits, amounts):
        s.money = a


async def drop_type_from_splits(db: AsyncSession, type_id: int) -> None:
    """Antes de borrar un tipo: se quita su parte de los movimientos divididos y el resto
    del movimiento se conserva (con otro tipo principal si hacía falta)."""
    res = await db.execute(
        select(Movement).join(MovementSplit, MovementSplit.movement_id == Movement.id)
        .where(MovementSplit.movement_type_id == type_id)
    )
    for mv in res.unique().scalars().all():
        parts = {s.movement_type_id: float(s.money) for s in mv.splits if s.movement_type_id != type_id}
        if parts:
            _set_parts(mv, parts)
