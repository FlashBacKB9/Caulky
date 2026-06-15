from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.real_account import RealAccount
from app.models.account import Account
from app.schemas.real_account import RealAccountRead, RealAccountCreate, RealAccountPatch
from app.auth.setup import current_active_user
from app.models.user import User

router = APIRouter(prefix="/real-accounts", tags=["real-accounts"])


def _to_read(ra: RealAccount) -> RealAccountRead:
    return RealAccountRead(
        id=ra.id,
        name=ra.name,
        entity_name=ra.entity_name,
        account_number=ra.account_number,
        color=ra.color,
        linked_account_ids=[a.id for a in ra.linked_accounts],
    )


@router.get("", response_model=list[RealAccountRead])
async def list_real_accounts(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(RealAccount).where(RealAccount.user_id == user.id).order_by(RealAccount.id)
    )
    return [_to_read(ra) for ra in result.scalars().all()]


@router.post("", response_model=RealAccountRead, status_code=201)
async def create_real_account(
    body: RealAccountCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    ra = RealAccount(
        name=body.name,
        entity_name=body.entity_name,
        account_number=body.account_number,
        color=body.color,
        user_id=user.id,
    )
    db.add(ra)
    await db.flush()
    if body.linked_account_ids:
        accs = (await db.execute(
            select(Account).where(Account.id.in_(body.linked_account_ids), Account.user_id == user.id)
        )).scalars().all()
        ra.linked_accounts = list(accs)
    await db.commit()
    await db.refresh(ra)
    return _to_read(ra)


@router.put("/{ra_id}", response_model=RealAccountRead)
async def update_real_account(
    ra_id: int,
    body: RealAccountPatch,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    ra = await db.get(RealAccount, ra_id)
    if not ra or ra.user_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    if body.name is not None:
        ra.name = body.name
    if body.entity_name is not None:
        ra.entity_name = body.entity_name
    if body.account_number is not None:
        ra.account_number = body.account_number
    if body.color is not None:
        ra.color = body.color
    if body.linked_account_ids is not None:
        accs = (await db.execute(
            select(Account).where(Account.id.in_(body.linked_account_ids), Account.user_id == user.id)
        )).scalars().all()
        ra.linked_accounts = list(accs)
    await db.commit()
    await db.refresh(ra)
    return _to_read(ra)


@router.delete("/{ra_id}", status_code=204)
async def delete_real_account(
    ra_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    ra = await db.get(RealAccount, ra_id)
    if not ra or ra.user_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(ra)
    await db.commit()
