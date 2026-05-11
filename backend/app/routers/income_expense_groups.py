from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.income_expense_group import IncomeExpenseGroup
from app.schemas.income_expense_group import (
    IncomeExpenseGroupCreate, IncomeExpenseGroupRead, IncomeExpenseGroupUpdate,
)
from app.services.audit import write_log
from app.auth.setup import current_active_user
from app.models.user import User

router = APIRouter(prefix="/groups", tags=["income_expense_groups"])


def _grp_snap(g: IncomeExpenseGroup) -> dict:
    return {"name": g.name, "color": g.color}


@router.get("", response_model=list[IncomeExpenseGroupRead])
async def list_groups(db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    result = await db.execute(
        select(IncomeExpenseGroup)
        .where(IncomeExpenseGroup.user_id == user.id)
        .order_by(IncomeExpenseGroup.id)
    )
    return result.scalars().all()


@router.post("", response_model=IncomeExpenseGroupRead, status_code=201)
async def create_group(body: IncomeExpenseGroupCreate, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    group = IncomeExpenseGroup(**body.model_dump(), user_id=user.id)
    db.add(group)
    await db.flush()
    write_log(db, user.id, "group", group.id, "create",
              f"Grupo creado: {group.name}",
              after=_grp_snap(group))
    await db.commit()
    await db.refresh(group)
    return group


@router.get("/{group_id}", response_model=IncomeExpenseGroupRead)
async def get_group(group_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    group = await db.get(IncomeExpenseGroup, group_id)
    if not group or group.user_id != user.id:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


@router.put("/{group_id}", response_model=IncomeExpenseGroupRead)
async def update_group(group_id: int, body: IncomeExpenseGroupUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    group = await db.get(IncomeExpenseGroup, group_id)
    if not group or group.user_id != user.id:
        raise HTTPException(status_code=404, detail="Group not found")
    before = _grp_snap(group)
    for k, v in body.model_dump().items():
        setattr(group, k, v)
    write_log(db, user.id, "group", group.id, "update",
              f"Grupo editado: {group.name}",
              before=before, after=_grp_snap(group))
    await db.commit()
    await db.refresh(group)
    return group


@router.delete("/{group_id}", status_code=204)
async def delete_group(group_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    group = await db.get(IncomeExpenseGroup, group_id)
    if not group or group.user_id != user.id:
        raise HTTPException(status_code=404, detail="Group not found")
    write_log(db, user.id, "group", group.id, "delete",
              f"Grupo eliminado: {group.name}",
              before=_grp_snap(group))
    await db.delete(group)
    await db.commit()
