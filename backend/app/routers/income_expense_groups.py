from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.income_expense_group import IncomeExpenseGroup
from app.schemas.income_expense_group import (
    IncomeExpenseGroupCreate, IncomeExpenseGroupRead, IncomeExpenseGroupUpdate,
)

router = APIRouter(prefix="/groups", tags=["income_expense_groups"])


@router.get("/", response_model=list[IncomeExpenseGroupRead])
async def list_groups(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(IncomeExpenseGroup).order_by(IncomeExpenseGroup.id))
    return result.scalars().all()


@router.post("/", response_model=IncomeExpenseGroupRead, status_code=201)
async def create_group(body: IncomeExpenseGroupCreate, db: AsyncSession = Depends(get_db)):
    group = IncomeExpenseGroup(**body.model_dump())
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return group


@router.get("/{group_id}", response_model=IncomeExpenseGroupRead)
async def get_group(group_id: int, db: AsyncSession = Depends(get_db)):
    group = await db.get(IncomeExpenseGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


@router.put("/{group_id}", response_model=IncomeExpenseGroupRead)
async def update_group(group_id: int, body: IncomeExpenseGroupUpdate, db: AsyncSession = Depends(get_db)):
    group = await db.get(IncomeExpenseGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    for k, v in body.model_dump().items():
        setattr(group, k, v)
    await db.commit()
    await db.refresh(group)
    return group


@router.delete("/{group_id}", status_code=204)
async def delete_group(group_id: int, db: AsyncSession = Depends(get_db)):
    group = await db.get(IncomeExpenseGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.delete(group)
    await db.commit()
