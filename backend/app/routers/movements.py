from datetime import date as date_type
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.movement import Movement
from app.models.movement_type import MovementType
from app.schemas.movement import MovementCreate, MovementRead, MovementUpdate
from app.services.calculations import compute_dinero, compute_label
from app.services.audit import write_log
from app.auth.setup import current_active_user
from app.models.user import User

router = APIRouter(prefix="/movements", tags=["movements"])


def _enrich(mv: Movement) -> MovementRead:
    group_name = ""
    color = "#6b7280"
    if mv.movement_type and mv.movement_type.income_expense_group:
        group_name = mv.movement_type.income_expense_group.name
        color = mv.movement_type.income_expense_group.color
    dinero = compute_dinero(float(mv.money), group_name)
    label = compute_label(float(mv.money), group_name)
    data = MovementRead.model_validate(mv)
    data.dinero = dinero
    data.label = label
    data.color = color
    return data


def _mv_snap(mv: Movement) -> dict:
    return {
        "name": mv.name,
        "money": float(mv.money),
        "date": str(mv.date),
        "bank_date": str(mv.bank_date) if mv.bank_date else None,
        "movement_type_id": mv.movement_type_id,
        "paid": mv.paid,
        "no_count": mv.no_count,
        "notes": mv.notes,
        "account_id": mv.account_id,
        "is_shared": mv.is_shared,
        "shared_between": mv.shared_between,
        "my_share": float(mv.my_share) if mv.my_share is not None else None,
    }


@router.get("", response_model=list[MovementRead])
async def list_movements(
    year: int | None = Query(None),
    month: int | None = Query(None),
    unassigned: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    q = select(Movement).where(Movement.user_id == user.id).options(
        selectinload(Movement.movement_type).selectinload(MovementType.income_expense_group)
    )
    if year:
        q = q.where(Movement.date >= date_type(year, 1, 1), Movement.date <= date_type(year, 12, 31))
    if month and year:
        q = q.where(Movement.date >= date_type(year, month, 1))
    if unassigned:
        q = q.where(Movement.movement_type_id.is_(None))
    q = q.order_by(Movement.date.desc())
    result = await db.execute(q)
    return [_enrich(mv) for mv in result.scalars().all()]


@router.post("", response_model=MovementRead, status_code=201)
async def create_movement(body: MovementCreate, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    mv = Movement(**body.model_dump(), user_id=user.id)
    db.add(mv)
    await db.flush()
    after = _mv_snap(mv)
    await write_log(db, user.id, "movement", mv.id, "create",
                   f"Movimiento creado: {mv.name} {float(mv.money):.2f}€ ({mv.date})",
                   after=after)
    await db.commit()
    result = await db.execute(
        select(Movement).where(Movement.id == mv.id).options(
            selectinload(Movement.movement_type).selectinload(MovementType.income_expense_group)
        )
    )
    return _enrich(result.scalar_one())


@router.get("/{movement_id}", response_model=MovementRead)
async def get_movement(movement_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    result = await db.execute(
        select(Movement).where(Movement.id == movement_id, Movement.user_id == user.id).options(
            selectinload(Movement.movement_type).selectinload(MovementType.income_expense_group)
        )
    )
    mv = result.scalar_one_or_none()
    if not mv:
        raise HTTPException(status_code=404, detail="Movement not found")
    return _enrich(mv)


@router.put("/{movement_id}", response_model=MovementRead)
async def update_movement(movement_id: int, body: MovementUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    result = await db.execute(
        select(Movement).where(Movement.id == movement_id, Movement.user_id == user.id).options(
            selectinload(Movement.movement_type).selectinload(MovementType.income_expense_group)
        )
    )
    mv = result.scalar_one_or_none()
    if not mv:
        raise HTTPException(status_code=404, detail="Movement not found")
    changes = body.model_dump(exclude_unset=True)
    before_snap = {k: _mv_snap(mv)[k] for k in changes if k in _mv_snap(mv)}
    for k, v in changes.items():
        setattr(mv, k, v)
    after_snap = {k: _mv_snap(mv)[k] for k in changes if k in _mv_snap(mv)}
    await write_log(db, user.id, "movement", mv.id, "update",
                   f"Movimiento editado: {mv.name}",
                   before=before_snap, after=after_snap)
    await db.commit()
    result = await db.execute(
        select(Movement).where(Movement.id == movement_id).options(
            selectinload(Movement.movement_type).selectinload(MovementType.income_expense_group)
        )
    )
    return _enrich(result.scalar_one())


@router.delete("/{movement_id}", status_code=204)
async def delete_movement(movement_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    mv = await db.get(Movement, movement_id)
    if not mv or mv.user_id != user.id:
        raise HTTPException(status_code=404, detail="Movement not found")
    before = _mv_snap(mv)
    await write_log(db, user.id, "movement", mv.id, "delete",
                   f"Movimiento eliminado: {mv.name} {float(mv.money):.2f}€ ({mv.date})",
                   before=before)
    await db.delete(mv)
    await db.commit()
