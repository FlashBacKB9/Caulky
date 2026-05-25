from datetime import date as date_type
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, case as sa_case
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.movement import Movement
from app.models.movement_type import MovementType
from app.models.income_expense_group import IncomeExpenseGroup
from app.models.account import Account
from app.schemas.movement import MovementCreate, MovementRead, MovementUpdate
from app.services.calculations import compute_dinero, compute_label
from app.services.audit import write_log
from app.auth.setup import current_active_user
from app.models.user import User

router = APIRouter(prefix="/movements", tags=["movements"])


async def _balance_for(db: AsyncSession, user_id, account_id: int | None) -> tuple[str | None, float | None]:
    """Balance of the corriente account affected by a movement.
    If account_id is given, use that account. Otherwise use the main one.
    """
    if account_id is not None:
        acc = await db.get(Account, account_id)
        if not acc or acc.user_id != user_id:
            return None, None
    else:
        res = await db.execute(
            select(Account).where(Account.user_id == user_id, Account.is_main == True)
        )
        acc = res.scalar_one_or_none()
        if not acc:
            return None, None

    dinero_expr = sa_case(
        (Movement.money < 0, func.abs(Movement.money)),
        (IncomeExpenseGroup.name == 'Ingreso', func.abs(Movement.money)),
        else_=-func.abs(Movement.money),
    )
    if acc.is_main:
        # main gets dinero from NULL account_id movements
        cond = (Movement.account_id.is_(None))
    else:
        cond = (Movement.account_id == acc.id)
    total_res = await db.execute(
        select(func.coalesce(func.sum(dinero_expr), 0))
        .where(Movement.user_id == user_id, Movement.no_count == False, cond)
        .outerjoin(MovementType, Movement.movement_type_id == MovementType.id)
        .outerjoin(IncomeExpenseGroup, MovementType.income_expense_group_id == IncomeExpenseGroup.id)
    )
    return acc.name, float(acc.initial_balance) + float(total_res.scalar())


async def _mv_dinero(db: AsyncSession, mv: Movement) -> float:
    group_name = ""
    if mv.movement_type_id:
        mt = await db.get(MovementType, mv.movement_type_id)
        if mt and mt.income_expense_group_id:
            g = await db.get(IncomeExpenseGroup, mt.income_expense_group_id)
            if g:
                group_name = g.name
    return compute_dinero(float(mv.money), group_name)


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
        "is_transfer": mv.is_transfer,
        "from_account_id": mv.from_account_id,
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
    acc_name, bal_before = await _balance_for(db, user.id, body.account_id)
    mv = Movement(**body.model_dump(), user_id=user.id)
    db.add(mv)
    await db.flush()
    after = _mv_snap(mv)
    summary = f"Movimiento creado: {mv.name} {float(mv.money):.2f}€ ({mv.date})"
    if acc_name and bal_before is not None and not mv.no_count:
        dinero = await _mv_dinero(db, mv)
        summary += f" | {acc_name}: {bal_before:.2f} → {bal_before + dinero:.2f}"
    await write_log(user.id, "movement", mv.id, "create", summary, after=after)
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
    await write_log(user.id, "movement", mv.id, "update",
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
    summary = f"Movimiento eliminado: {mv.name} {float(mv.money):.2f}€ ({mv.date})"
    if not mv.no_count:
        acc_name, bal_before = await _balance_for(db, user.id, mv.account_id)
        if acc_name and bal_before is not None:
            dinero = await _mv_dinero(db, mv)
            summary += f" | {acc_name}: {bal_before:.2f} → {bal_before - dinero:.2f}"
    await write_log(user.id, "movement", mv.id, "delete", summary, before=before)
    await db.delete(mv)
    await db.commit()
