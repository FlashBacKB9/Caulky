import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, case, delete as sa_delete, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.account import Account
from app.models.movement import Movement
from app.models.movement_type import MovementType
from app.models.income_expense_group import IncomeExpenseGroup
from app.schemas.account import AccountRead, AccountCreate, AccountPatch, AccountsReorder, CreditChargeCreate
from app.services.audit import write_log
from app.services.credit import CREDIT_CATEGORY, create_charge, ensure_last_cycle_end, pending_cycles, sync_credit_charges
from datetime import date
from app.auth.setup import current_active_user
from app.models.user import User

router = APIRouter(prefix="/accounts", tags=["accounts"])


def _acc_snap(a: Account) -> dict:
    return {"name": a.name, "color": a.color, "icon": a.icon, "initial_balance": float(a.initial_balance), "category": a.category, "depreciation_rate": float(a.depreciation_rate) if a.depreciation_rate is not None else None, "value_date": str(a.value_date) if a.value_date else None, "new_car": a.new_car, "credit_limit": float(a.credit_limit) if a.credit_limit is not None else None, "credit_cutoff_day": a.credit_cutoff_day, "credit_charge_day": a.credit_charge_day, "credit_pay_account_id": a.credit_pay_account_id, "credit_auto_charge": a.credit_auto_charge}


def _validate_credit(a: Account) -> None:
    for day in (a.credit_cutoff_day, a.credit_charge_day):
        if day is not None and not 1 <= day <= 31:
            raise HTTPException(status_code=422, detail="Los días de corte y cargo van del 1 al 31")
    if a.category == CREDIT_CATEGORY and (a.credit_cutoff_day is None or a.credit_charge_day is None):
        raise HTTPException(status_code=422, detail="Una tarjeta de crédito necesita día de corte y día de cargo")
    if a.credit_pay_account_id is not None and a.credit_pay_account_id == a.id:
        raise HTTPException(status_code=422, detail="La tarjeta no puede pagarse a sí misma")


def _read(a: Account, balance: float) -> AccountRead:
    data = AccountRead.model_validate(a)
    data.balance = balance
    if a.category == CREDIT_CATEGORY and a.credit_limit is not None:
        # El saldo de la tarjeta es la deuda (negativa); lo que queda por gastar es tope + saldo
        data.credit_available = float(a.credit_limit) + balance
    return data


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

    # Dinero of non-transfer movements without account_id → main account
    if main_id is not None:
        null_res = await db.execute(
            select(func.coalesce(func.sum(dinero_expr), 0))
            .where(Movement.user_id == user_id, Movement.no_count == False, Movement.account_id.is_(None), Movement.is_transfer == False)
            .outerjoin(MovementType, Movement.movement_type_id == MovementType.id)
            .outerjoin(IncomeExpenseGroup, MovementType.income_expense_group_id == IncomeExpenseGroup.id)
        )
        balances[main_id] += float(null_res.scalar())

    # Linked accounts (savings) via MovementType.linked_account_id — sets base balance with =
    savings_res = await db.execute(
        select(MovementType.linked_account_id, func.sum(Movement.money))
        .join(Movement, Movement.movement_type_id == MovementType.id)
        .where(MovementType.linked_account_id.is_not(None), Movement.user_id == user_id, Movement.no_count == False, Movement.is_transfer == False)
        .group_by(MovementType.linked_account_id)
    )
    for account_id, total in savings_res.all():
        if account_id in balances:
            balances[account_id] = float(total)

    # Dinero of non-transfer movements with explicit account_id → that account
    # Runs after savings_res so direct deposits to savings accounts are added on top
    per_acc_res = await db.execute(
        select(Movement.account_id, func.sum(dinero_expr))
        .where(Movement.user_id == user_id, Movement.no_count == False, Movement.account_id.is_not(None), Movement.is_transfer == False)
        .outerjoin(MovementType, Movement.movement_type_id == MovementType.id)
        .outerjoin(IncomeExpenseGroup, MovementType.income_expense_group_id == IncomeExpenseGroup.id)
        .group_by(Movement.account_id)
    )
    for aid, total in per_acc_res.all():
        if aid in balances:
            balances[aid] += float(total)

    # Transfers: credit destination (+money), debit source (-money)
    # Must run after savings_res so the += is not overwritten by savings = assignment
    transfer_res = await db.execute(
        select(Movement.account_id, Movement.from_account_id, func.sum(func.abs(Movement.money)))
        .where(Movement.user_id == user_id, Movement.no_count == False, Movement.is_transfer == True)
        .group_by(Movement.account_id, Movement.from_account_id)
    )
    for dest_id, src_id, total in transfer_res.all():
        amount = float(total or 0)
        if dest_id is not None and dest_id in balances:
            balances[dest_id] += amount
        if src_id is not None and src_id in balances:
            balances[src_id] -= amount

    return balances


async def _build_account_items(db: AsyncSession, user_id: uuid.UUID) -> list[AccountRead]:
    result = await db.execute(
        select(Account).where(Account.user_id == user_id).order_by(Account.sort_order)
    )
    accounts = result.scalars().all()
    balances = await _compute_balances(db, user_id)
    return [_read(a, float(a.initial_balance) + balances.get(a.id, 0.0)) for a in accounts]


@router.get("", response_model=list[AccountRead])
async def list_accounts(db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    await sync_credit_charges(db, user.id)
    return await _build_account_items(db, user.id)


@router.get("/summary")
async def accounts_summary(db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    await sync_credit_charges(db, user.id)
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
        depreciation_rate=body.depreciation_rate, value_date=body.value_date, new_car=body.new_car,
        interest_enabled=body.interest_enabled, interest_type_id=body.interest_type_id,
        interest_tax_rate=body.interest_tax_rate,
        credit_limit=body.credit_limit, credit_cutoff_day=body.credit_cutoff_day,
        credit_charge_day=body.credit_charge_day, credit_pay_account_id=body.credit_pay_account_id,
        credit_auto_charge=body.credit_auto_charge,
    )
    _validate_credit(account)
    ensure_last_cycle_end(account)
    db.add(account)
    await db.flush()
    await write_log(user.id, "account", account.id, "create",
              f"Cuenta creada: {account.name}",
              after=_acc_snap(account))
    await db.commit()
    await db.refresh(account)
    return _read(account, float(account.initial_balance))


@router.put("/{account_id}", response_model=AccountRead)
async def update_account(account_id: int, body: AccountPatch, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    account = await db.get(Account, account_id)
    if not account or account.user_id != user.id:
        raise HTTPException(status_code=404, detail="Account not found")
    changes = body.model_dump(exclude_unset=True)
    before = {k: _acc_snap(account)[k] for k in changes if k in _acc_snap(account)}
    for k, v in changes.items():
        setattr(account, k, v)
    _validate_credit(account)
    ensure_last_cycle_end(account)
    await write_log(user.id, "account", account.id, "update",
              f"Cuenta editada: {account.name}",
              before=before, after={k: _acc_snap(account)[k] for k in changes if k in _acc_snap(account)})
    await db.commit()
    balances = await _compute_balances(db, user.id)
    return _read(account, float(account.initial_balance) + balances.get(account.id, 0.0))


@router.get("/credit-cycles")
async def list_credit_cycles(db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    """Cargos de tarjeta aún sin registrar, para mostrarlos como previsión en el calendario."""
    await sync_credit_charges(db, user.id)
    res = await db.execute(
        select(Account).where(Account.user_id == user.id, Account.category == CREDIT_CATEGORY)
    )
    today = date.today()
    out = []
    for acc in res.scalars().all():
        for c in await pending_cycles(db, acc, today):
            out.append({
                "account_id": c.account_id,
                "cycle_start": c.cycle_start,
                "cycle_end": c.cycle_end,
                "charge_date": c.charge_date,
                "amount": c.amount,
                "pay_account_id": c.pay_account_id,
                "closed": c.closed,
                "due": c.due,
                "auto": acc.credit_auto_charge,
            })
    return out


@router.post("/{account_id}/credit-charges", status_code=201)
async def create_credit_charge(
    account_id: int,
    body: CreditChargeCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    """Registra a mano el cargo de un ciclo cerrado (tarjetas sin cargo automático, o adelantarlo)."""
    account = await db.get(Account, account_id)
    if not account or account.user_id != user.id or account.category != CREDIT_CATEGORY:
        raise HTTPException(status_code=404, detail="Account not found")
    cycles = await pending_cycles(db, account, date.today())
    if not cycles or cycles[0].cycle_end != body.cycle_end:
        raise HTTPException(status_code=409, detail="Los cargos se registran en orden: primero el ciclo más antiguo")
    cycle = cycles[0]
    if not cycle.closed:
        raise HTTPException(status_code=409, detail="El ciclo sigue abierto: aún pueden entrar compras")
    amount = round(body.amount if body.amount is not None else cycle.amount, 2)
    mv = await create_charge(db, account, cycle, amount)
    await db.flush()
    if mv is not None:
        await write_log(user.id, "movement", mv.id, "create",
                        f"Liquidación de tarjeta: {account.name} {amount:.2f}€ ({mv.date})")
    await db.commit()
    return {"movement_id": mv.id if mv is not None else None, "amount": amount}


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
