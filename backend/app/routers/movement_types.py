from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.movement_type import MovementType
from app.schemas.movement_type import MovementTypeCreate, MovementTypeRead, MovementTypeUpdate

router = APIRouter(prefix="/movement-types", tags=["movement_types"])


def _with_color(mt: MovementType) -> MovementTypeRead:
    data = MovementTypeRead.model_validate(mt)
    data.color = mt.color or (mt.income_expense_group.color if mt.income_expense_group else "#6b7280")
    return data


@router.get("", response_model=list[MovementTypeRead])
async def list_types(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MovementType)
        .options(selectinload(MovementType.income_expense_group))
        .order_by(MovementType.income_expense_group_id, MovementType.name)
    )
    return [_with_color(mt) for mt in result.scalars().all()]


@router.post("", response_model=MovementTypeRead, status_code=201)
async def create_type(body: MovementTypeCreate, db: AsyncSession = Depends(get_db)):
    mt = MovementType(**body.model_dump())
    db.add(mt)
    await db.commit()
    result = await db.execute(
        select(MovementType).where(MovementType.id == mt.id)
        .options(selectinload(MovementType.income_expense_group))
    )
    return _with_color(result.scalar_one())


@router.get("/{type_id}", response_model=MovementTypeRead)
async def get_type(type_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MovementType).where(MovementType.id == type_id)
        .options(selectinload(MovementType.income_expense_group))
    )
    mt = result.scalar_one_or_none()
    if not mt:
        raise HTTPException(status_code=404, detail="Movement type not found")
    return _with_color(mt)


@router.put("/{type_id}", response_model=MovementTypeRead)
async def update_type(type_id: int, body: MovementTypeUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MovementType).where(MovementType.id == type_id)
        .options(selectinload(MovementType.income_expense_group))
    )
    mt = result.scalar_one_or_none()
    if not mt:
        raise HTTPException(status_code=404, detail="Movement type not found")
    for k, v in body.model_dump().items():
        setattr(mt, k, v)
    await db.commit()
    result = await db.execute(
        select(MovementType).where(MovementType.id == type_id)
        .options(selectinload(MovementType.income_expense_group))
    )
    return _with_color(result.scalar_one())


@router.delete("/{type_id}", status_code=204)
async def delete_type(type_id: int, db: AsyncSession = Depends(get_db)):
    mt = await db.get(MovementType, type_id)
    if not mt:
        raise HTTPException(status_code=404, detail="Movement type not found")
    await db.delete(mt)
    await db.commit()
