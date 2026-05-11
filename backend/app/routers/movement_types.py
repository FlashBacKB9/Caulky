from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.movement_type import MovementType
from app.schemas.movement_type import MovementTypeCreate, MovementTypeRead, MovementTypeUpdate
from app.services.audit import write_log
from app.auth.setup import current_active_user
from app.models.user import User

router = APIRouter(prefix="/movement-types", tags=["movement_types"])


def _with_color(mt: MovementType) -> MovementTypeRead:
    data = MovementTypeRead.model_validate(mt)
    data.color = mt.color or (mt.income_expense_group.color if mt.income_expense_group else "#6b7280")
    return data


def _type_snap(mt: MovementType) -> dict:
    return {
        "name": mt.name,
        "category": mt.category,
        "income_expense_group_id": mt.income_expense_group_id,
        "color": mt.color,
        "linked_account_id": mt.linked_account_id,
    }


@router.get("", response_model=list[MovementTypeRead])
async def list_types(db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    result = await db.execute(
        select(MovementType)
        .where(MovementType.user_id == user.id)
        .options(selectinload(MovementType.income_expense_group))
        .order_by(MovementType.income_expense_group_id, MovementType.name)
    )
    return [_with_color(mt) for mt in result.scalars().all()]


@router.post("", response_model=MovementTypeRead, status_code=201)
async def create_type(body: MovementTypeCreate, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    mt = MovementType(**body.model_dump(), user_id=user.id)
    db.add(mt)
    await db.flush()
    write_log(db, user.id, "movement_type", mt.id, "create",
              f"Tipo creado: {mt.name}",
              after=_type_snap(mt))
    await db.commit()
    result = await db.execute(
        select(MovementType).where(MovementType.id == mt.id)
        .options(selectinload(MovementType.income_expense_group))
    )
    return _with_color(result.scalar_one())


@router.get("/{type_id}", response_model=MovementTypeRead)
async def get_type(type_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    result = await db.execute(
        select(MovementType).where(MovementType.id == type_id, MovementType.user_id == user.id)
        .options(selectinload(MovementType.income_expense_group))
    )
    mt = result.scalar_one_or_none()
    if not mt:
        raise HTTPException(status_code=404, detail="Movement type not found")
    return _with_color(mt)


@router.put("/{type_id}", response_model=MovementTypeRead)
async def update_type(type_id: int, body: MovementTypeUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    result = await db.execute(
        select(MovementType).where(MovementType.id == type_id, MovementType.user_id == user.id)
        .options(selectinload(MovementType.income_expense_group))
    )
    mt = result.scalar_one_or_none()
    if not mt:
        raise HTTPException(status_code=404, detail="Movement type not found")
    before = _type_snap(mt)
    for k, v in body.model_dump().items():
        setattr(mt, k, v)
    write_log(db, user.id, "movement_type", mt.id, "update",
              f"Tipo editado: {mt.name}",
              before=before, after=_type_snap(mt))
    await db.commit()
    result = await db.execute(
        select(MovementType).where(MovementType.id == type_id)
        .options(selectinload(MovementType.income_expense_group))
    )
    return _with_color(result.scalar_one())


@router.delete("/{type_id}", status_code=204)
async def delete_type(type_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    mt = await db.get(MovementType, type_id)
    if not mt or mt.user_id != user.id:
        raise HTTPException(status_code=404, detail="Movement type not found")
    write_log(db, user.id, "movement_type", mt.id, "delete",
              f"Tipo eliminado: {mt.name}",
              before=_type_snap(mt))
    await db.delete(mt)
    await db.commit()
