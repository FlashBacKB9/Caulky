from datetime import date

import pytest
from sqlalchemy import select

from app.models.account import Account
from app.models.income_expense_group import IncomeExpenseGroup
from app.models.movement import Movement
from app.models.movement_type import MovementType
from app.routers.accounts import _compute_balances
from app.services.credit import (
    charge_date_for, initial_last_cycle_end, pending_cycles, sync_credit_charges,
)


# ── fechas ────────────────────────────────────────────────────────────────────

def test_charge_date_next_month():
    # Corte 25, cargo 5: el ciclo que cierra el 25/10 se cobra el 05/11
    assert charge_date_for(date(2026, 10, 25), 5) == date(2026, 11, 5)


def test_charge_date_same_month():
    # Corte 10, cargo 20: se cobra el mismo mes
    assert charge_date_for(date(2026, 10, 10), 20) == date(2026, 10, 20)


def test_cutoff_31_clamps_to_month_end():
    # Corte 31 en septiembre es el 30; con cargo 1 se cobra el 01/10
    assert initial_last_cycle_end(date(2026, 10, 7), 31, 1) == date(2026, 9, 30)


def test_initial_last_cycle_end_skips_charge_today():
    # Hoy es día de cargo: ese cargo aún está por generar, así que su ciclo no cuenta como cobrado
    assert initial_last_cycle_end(date(2026, 10, 5), 25, 5) == date(2026, 8, 25)
    assert initial_last_cycle_end(date(2026, 10, 7), 25, 5) == date(2026, 9, 25)


# ── helpers ───────────────────────────────────────────────────────────────────

async def _setup(db, user, *, auto=True, last=date(2026, 8, 31)):
    main = Account(name="Principal", color="#000", icon="wallet", initial_balance=1000,
                   sort_order=0, is_main=True, user_id=user.id)
    card = Account(name="Visa", color="#000", icon="card", initial_balance=0, sort_order=1,
                   is_main=False, category="credito", credit_limit=1500,
                   credit_cutoff_day=31, credit_charge_day=5, credit_auto_charge=auto,
                   credit_last_cycle_end=last, user_id=user.id)
    g = IncomeExpenseGroup(name="Gastos", color="#000", user_id=user.id)
    db.add_all([main, card, g])
    await db.flush()
    t = MovementType(name="Super", category="Vida Diaria", income_expense_group_id=g.id, user_id=user.id)
    db.add(t)
    await db.flush()
    return main, card, t


async def _buy(db, user, card, t, money, d):
    db.add(Movement(name="compra", money=money, date=d, movement_type_id=t.id, account_id=card.id,
                    paid=True, no_count=False, is_shared=False, user_id=user.id))
    await db.flush()


async def _charges(db, user):
    res = await db.execute(select(Movement).where(Movement.user_id == user.id, Movement.credit_cycle_end.is_not(None)))
    return res.scalars().all()


# ── liquidación ───────────────────────────────────────────────────────────────

async def test_auto_charge_groups_cycle_purchases(db, user):
    main, card, t = await _setup(db, user)
    await _buy(db, user, card, t, 100, date(2026, 9, 3))
    await _buy(db, user, card, t, 50, date(2026, 9, 30))
    await _buy(db, user, card, t, -20, date(2026, 9, 15))   # devolución
    await _buy(db, user, card, t, 70, date(2026, 10, 2))    # siguiente ciclo

    created = await sync_credit_charges(db, user.id, today=date(2026, 10, 5))
    assert created == 1
    [mv] = await _charges(db, user)
    assert float(mv.money) == pytest.approx(130.0)
    assert mv.date == date(2026, 10, 5)
    assert mv.is_transfer and mv.account_id == card.id and mv.from_account_id == main.id
    assert card.credit_last_cycle_end == date(2026, 9, 30)

    balances = await _compute_balances(db, user.id)
    # La corriente solo baja por el cargo; la tarjeta queda con la deuda del ciclo en curso
    assert balances[main.id] == pytest.approx(-130.0)
    assert balances[card.id] == pytest.approx(-70.0)


async def test_sync_is_idempotent_and_waits_for_charge_day(db, user):
    _, card, t = await _setup(db, user)
    await _buy(db, user, card, t, 100, date(2026, 9, 3))
    assert await sync_credit_charges(db, user.id, today=date(2026, 10, 4)) == 0
    assert await sync_credit_charges(db, user.id, today=date(2026, 10, 5)) == 1
    assert await sync_credit_charges(db, user.id, today=date(2026, 10, 6)) == 0
    assert len(await _charges(db, user)) == 1


async def test_deleted_charge_is_not_regenerated(db, user):
    _, card, t = await _setup(db, user)
    await _buy(db, user, card, t, 100, date(2026, 9, 3))
    await sync_credit_charges(db, user.id, today=date(2026, 10, 5))
    [mv] = await _charges(db, user)
    await db.delete(mv)
    await db.flush()
    assert await sync_credit_charges(db, user.id, today=date(2026, 10, 6)) == 0


async def test_manual_card_keeps_pending_cycles(db, user):
    _, card, t = await _setup(db, user, auto=False)
    await _buy(db, user, card, t, 100, date(2026, 9, 3))
    await _buy(db, user, card, t, 40, date(2026, 10, 3))
    assert await sync_credit_charges(db, user.id, today=date(2026, 10, 7)) == 0

    cycles = await pending_cycles(db, card, date(2026, 10, 7))
    assert [(c.cycle_end, c.amount, c.due, c.closed) for c in cycles] == [
        (date(2026, 9, 30), 100.0, True, True),
        (date(2026, 10, 31), 40.0, False, False),
    ]


async def test_months_without_app_catch_up(db, user):
    _, card, t = await _setup(db, user)
    await _buy(db, user, card, t, 100, date(2026, 9, 3))
    await _buy(db, user, card, t, 60, date(2026, 10, 3))
    # Un mes sin abrir la app: se generan los dos cargos vencidos de golpe
    assert await sync_credit_charges(db, user.id, today=date(2026, 11, 20)) == 2
    assert sorted(float(m.money) for m in await _charges(db, user)) == [60.0, 100.0]


async def test_manual_confirm_endpoint_in_order(db, user):
    from fastapi import HTTPException
    from app.routers.accounts import create_credit_charge
    from app.schemas.account import CreditChargeCreate

    # Corte muy antiguo: los ciclos están cerrados sea cual sea la fecha real de hoy
    _, card, t = await _setup(db, user, auto=False, last=date(2020, 1, 31))
    await _buy(db, user, card, t, 30, date(2020, 2, 10))
    await _buy(db, user, card, t, 20, date(2020, 3, 10))

    with pytest.raises(HTTPException) as exc:
        await create_credit_charge(card.id, CreditChargeCreate(cycle_end=date(2020, 3, 31)), db=db, user=user)
    assert exc.value.status_code == 409

    res = await create_credit_charge(card.id, CreditChargeCreate(cycle_end=date(2020, 2, 29), amount=31.5), db=db, user=user)
    assert res["amount"] == 31.5
    [mv] = await _charges(db, user)
    assert mv.date == date(2020, 3, 5) and float(mv.money) == 31.5
    assert card.credit_last_cycle_end == date(2020, 2, 29)


async def test_credit_link_both_ways(db, user):
    from app.routers.movements import get_credit_link

    _, card, t = await _setup(db, user)
    await _buy(db, user, card, t, 100, date(2026, 9, 3))
    await _buy(db, user, card, t, 50, date(2026, 9, 30))
    await _buy(db, user, card, t, 70, date(2026, 10, 2))    # siguiente ciclo, aún sin cobrar
    await sync_credit_charges(db, user.id, today=date(2026, 10, 5))
    [charge] = await _charges(db, user)
    assert charge.credit_cycle_start == date(2026, 9, 1)

    link = await get_credit_link(charge.id, db=db, user=user)
    assert [i.money for i in link["items"]] == [100, 50]
    assert link["settlement"] is None

    purchases = (await db.execute(
        select(Movement).where(Movement.account_id == card.id, Movement.is_transfer == False)  # noqa: E712
        .order_by(Movement.date))).scalars().all()
    paid = await get_credit_link(purchases[0].id, db=db, user=user)
    assert paid["settlement"].id == charge.id
    unpaid = await get_credit_link(purchases[2].id, db=db, user=user)
    assert unpaid["settlement"] is None and unpaid["items"] == []


async def test_rewind_generates_past_charges_once(db, user):
    _, card, t = await _setup(db, user)
    await _buy(db, user, card, t, 100, date(2026, 9, 3))
    await sync_credit_charges(db, user.id, today=date(2026, 10, 5))
    await _buy(db, user, card, t, 40, date(2026, 8, 10))   # compra de agosto dada de alta tarde

    # Retrasar el punto de partida: se genera agosto y septiembre no se duplica
    card.credit_last_cycle_end = date(2026, 7, 31)
    assert await sync_credit_charges(db, user.id, today=date(2026, 10, 6)) == 1
    charges = sorted((c.credit_cycle_end, float(c.money), c.date) for c in await _charges(db, user))
    assert charges == [
        (date(2026, 8, 31), 40.0, date(2026, 9, 5)),
        (date(2026, 9, 30), 100.0, date(2026, 10, 5)),
    ]
    assert card.credit_last_cycle_end == date(2026, 9, 30)


def test_patch_rejects_future_last_cycle_end():
    from pydantic import ValidationError
    from app.schemas.account import AccountPatch
    with pytest.raises(ValidationError):
        AccountPatch(credit_last_cycle_end=date(2999, 1, 31))
    assert AccountPatch(credit_last_cycle_end=date(2026, 8, 31)).credit_last_cycle_end == date(2026, 8, 31)


async def test_card_purchase_bank_date_is_charge_day(db, user):
    from app.routers.movements import create_movement, update_movement
    from app.schemas.movement import MovementCreate, MovementUpdate

    _, card, t = await _setup(db, user)   # corte 31, cargo 5
    mv = await create_movement(MovementCreate(name="Taxi", money=30, date=date(2026, 10, 7),
                                              bank_date=date(2026, 10, 7), movement_type_id=t.id,
                                              account_id=card.id), db=db, user=user)
    assert mv.bank_date == date(2026, 11, 5)
    # Al moverla al ciclo siguiente, la fecha banco la sigue
    mv = await update_movement(mv.id, MovementUpdate(date=date(2026, 11, 2)), db=db, user=user)
    assert mv.bank_date == date(2026, 12, 5)


async def test_generated_charge_sets_purchases_bank_date(db, user):
    _, card, t = await _setup(db, user)
    await _buy(db, user, card, t, 100, date(2026, 9, 3))
    await sync_credit_charges(db, user.id, today=date(2026, 10, 5))
    purchase = (await db.execute(select(Movement).where(
        Movement.account_id == card.id, Movement.is_transfer == False))).scalar_one()  # noqa: E712
    assert purchase.bank_date == date(2026, 10, 5)
