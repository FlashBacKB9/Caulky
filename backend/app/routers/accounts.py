import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, case, delete as sa_delete, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.account import Account
from app.models.movement import Movement
from app.models.movement_type import MovementType
from app.models.income_expense_group import IncomeExpenseGroup
from app.schemas.account import AccountRead, AccountCreate, AccountPatch, AccountsReorder
from app.services.audit import write_log
from app.auth.setup import current_active_user
from app.models.user import User

router = APIRouter(prefix="/accounts", tags=["accounts"])


def _acc_snap(a: Account) -> dict:
    return {"name": a.name, "color": a.color, "icon": a.icon, "initial_balance": float(a.initial_balance), "category": a.category}


async def _compute_balances(db: AsyncSession, user_id: uuid.UUID) -> dict[int, float]:
    accounts_res = await db.execute(
        select(Account).where(Account.user_id == user_id).order_by(Account.sort_order)
    )
    accounts = accounts_res.scalars().all()
    balances: dict[int, float] = {a.id: 0.0 for a in accounts}
    main_id = next((a.id for a in accounts if a.is_main), None)

    dinero_expr = case(
        (Movement.money < 0, func.abs(Movement.money)),
        (IncomeExpenseGroup.name == "Ingreso", func.abs(Movement.money)),
        else_=-func.abs(Movement.money),
    )

    # Dinero of movements with explicit account_id → that account
    per_acc_res = await db.execute(
        select(Movement.account_id, func.sum(dinero_expr))
        .where(Movement.user_id == user_id, Movement.no_count == False, Movement.account_id.is_not(None))
        .outerjoin(MovementType, Movement.movement_type_id == MovementType.id)
        .outerjoin(IncomeExpenseGroup, MovementType.income_expense_group_id == IncomeExpenseGroup.id)
        .group_by(Movement.account_id)
    )
    for aid, total in per_acc_res.all():
        if aid in balances:
            balances[aid] += float(total)

    # Dinero of movements without account_id → main account
    if main_id is not None:
        null_res = await db.execute(
            select(func.coalesce(func.sum(dinero_expr), 0))
            .where(Movement.user_id == user_id, Movement.no_count == False, Movement.account_id.is_(None))
            .outerjoin(MovementType, Movement.movement_type_id == MovementType.id)
            .outerjoin(IncomeExpenseGroup, MovementType.income_expense_group_id == IncomeExpenseGroup.id)
        )
        balances[main_id] += float(null_res.scalar())

    # Linked accounts (savings) via MovementType.linked_account_id
    savings_res = await db.execute(
        select(MovementType.linked_account_id, func.sum(Movement.money))
        .join(Movement, Movement.movement_type_id == MovementType.id)
        .where(MovementType.linked_account_id.is_not(None), Movement.user_id == user_id, Movement.no_count == False)
        .group_by(MovementType.linked_account_id)
    )
    for account_id, total in savings_res.all():
        if account_id in balances:
            balances[account_id] = float(total)

    return balances


async def _build_account_items(db: AsyncSession, user_id: uuid.UUID) -> list[AccountRead]:
    result = await db.execute(
        select(Account).where(Account.user_id == user_id).order_by(Account.sort_order)
    )
    accounts = result.scalars().all()
    balances = await _compute_balances(db, user_id)
    items = []
    for a in accounts:
        data = AccountRead.model_validate(a)
        data.balance = float(a.initial_balance) + balances.get(a.id, 0.0)
        items.append(data)
    return items


@router.get("", response_model=list[AccountRead])
async def list_accounts(db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    return await _build_account_items(db, user.id)


@router.get("/summary")
async def accounts_summary(db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    items = await _build_account_items(db, user.id)
    total = sum(item.balance for item in items)
    return {"accounts": items, "total": total}


@router.post("", response_model=AccountRead, status_code=201)
async def create_account(body: AccountCreate, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    res = await db.execute(
        select(func.max(Account.sort_order)).where(Account.user_id == user.id)
    )
    max_order = res.scalar() or 0
    account = Account(
        name=body.name, color=body.color, icon=body.icon,
        initial_balance=body.initial_balance, sort_order=max_order + 1,
        is_main=False, user_id=user.id, category=body.category,
    )
    db.add(account)
    await db.flush()
    await write_log(user.id, "account", account.id, "create",
              f"Cuenta creada: {account.name}",
              after=_acc_snap(account))
    await db.commit()
    await db.refresh(account)
    data = AccountRead.model_validate(account)
    data.balance = float(account.initial_balance)
    return data


@router.put("/{account_id}", response_model=AccountRead)
async def update_account(account_id: int, body: AccountPatch, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    account = await db.get(Account, account_id)
    if not account or account.user_id != user.id:
        raise HTTPException(status_code=404, detail="Account not found")
    changes = body.model_dump(exclude_unset=True)
    before = {k: _acc_snap(account)[k] for k in changes if k in _acc_snap(account)}
    for k, v in changes.items():
        setattr(account, k, v)
    await write_log(user.id, "account", account.id, "update",
              f"Cuenta editada: {account.name}",
              before=before, after={k: _acc_snap(account)[k] for k in changes if k in _acc_snap(account)})
    await db.commit()
    balances = await _compute_balances(db, user.id)
    data = AccountRead.model_validate(account)
    data.balance = float(account.initial_balance) + balances.get(account.id, 0.0)
    return data


@router.post("/reorder", status_code=204)
async def reorder_accounts(
    body: AccountsReorder,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    res = await db.execute(select(Account).where(Account.user_id == user.id))
    accounts = {a.id: a for a in res.scalars().all()}
    for index, account_id in enumerate(body.ids):
        a = accounts.get(account_id)
        if a is not None:
            a.sort_order = index
    await db.commit()


@router.delete("/{account_id}", status_code=204)
async def delete_account(
    account_id: int,
    delete_movements: bool = Query(False),
    convert_to_expense: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    account = await db.get(Account, account_id)
    if not account or account.user_id != user.id:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.is_main:
        raise HTTPException(status_code=400, detail="Cannot delete the main account")

    types_res = await db.execute(
        select(MovementType.id).where(MovementType.linked_account_id == account_id)
    )
    linked_type_ids = [r[0] for r in types_res.all()]

    count = 0
    if linked_type_ids:
        r = await db.execute(
            select(func.count(Movement.id)).where(Movement.movement_type_id.in_(linked_type_ids))
        )
        count += r.scalar() or 0
    r2 = await db.execute(select(func.count(Movement.id)).where(Movement.account_id == account_id))
    count += r2.scalar() or 0

    if count > 0 and not delete_movements and not convert_to_expense:
        raise HTTPException(status_code=409, detail=str(count))

    if delete_movements:
        if linked_type_ids:
            await db.execute(sa_delete(Movement).where(Movement.movement_type_id.in_(linked_type_ids)))
        await db.execute(sa_delete(Movement).where(Movement.account_id == account_id))

    if linked_type_ids:
        await db.execute(
            sa_update(MovementType)
            .where(MovementType.linked_account_id == account_id)
            .values(linked_account_id=None)
        )

    await write_log(user.id, "account", account.id, "delete",
              f"Cuenta eliminada: {account.name}",
              before=_acc_snap(account))
    await db.delete(account)
    await db.commit()
