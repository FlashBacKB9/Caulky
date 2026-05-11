from datetime import date

import pytest
from sqlalchemy import select

from app.models.account import Account
from app.models.income_expense_group import IncomeExpenseGroup
from app.models.movement import Movement
from app.models.movement_type import MovementType
from app.routers.accounts import _compute_balances


# ── helpers ───────────────────────────────────────────────────────────────────

async def _group(db, user, name):
    g = IncomeExpenseGroup(name=name, color="#000000", user_id=user.id)
    db.add(g)
    await db.flush()
    return g


async def _account(db, user, name, *, is_main=True, initial_balance=0):
    a = Account(name=name, color="#000000", icon="wallet",
                initial_balance=initial_balance, sort_order=0,
                is_main=is_main, user_id=user.id)
    db.add(a)
    await db.flush()
    return a


async def _type(db, user, name, group, *, linked_account=None):
    t = MovementType(name=name, category="Vida Diaria",
                     income_expense_group_id=group.id,
                     linked_account_id=linked_account.id if linked_account else None,
                     user_id=user.id)
    db.add(t)
    await db.flush()
    return t


async def _movement(db, user, money, typ=None, *, no_count=False):
    m = Movement(name="mv", money=money, date=date(2024, 1, 15),
                 movement_type_id=typ.id if typ else None,
                 paid=True, no_count=no_count, is_shared=False, user_id=user.id)
    db.add(m)
    await db.flush()
    return m


# ── tests ─────────────────────────────────────────────────────────────────────

async def test_income_adds_to_main(db, user):
    """Income movement (group Ingreso) should add positively to main account balance."""
    main = await _account(db, user, "Principal", is_main=True)
    g = await _group(db, user, "Ingreso")
    t = await _type(db, user, "Nómina", g)
    await _movement(db, user, 1000, t)

    balances = await _compute_balances(db, user.id)
    assert balances[main.id] == pytest.approx(1000.0)


async def test_expense_subtracts_from_main(db, user):
    """Expense movement (non-Ingreso group) should reduce the main account balance."""
    main = await _account(db, user, "Principal", is_main=True)
    g = await _group(db, user, "Alimentación")
    t = await _type(db, user, "Supermercado", g)
    await _movement(db, user, 200, t)

    balances = await _compute_balances(db, user.id)
    assert balances[main.id] == pytest.approx(-200.0)


async def test_no_count_movement_excluded(db, user):
    """Movement with no_count=True must not affect the balance."""
    main = await _account(db, user, "Principal", is_main=True)
    g = await _group(db, user, "Gasto")
    t = await _type(db, user, "Tipo", g)
    await _movement(db, user, 500, t, no_count=True)
    await _movement(db, user, 100, t, no_count=False)

    balances = await _compute_balances(db, user.id)
    assert balances[main.id] == pytest.approx(-100.0)


async def test_refund_adds_to_main(db, user):
    """Negative money (refund) should add positively regardless of group."""
    main = await _account(db, user, "Principal", is_main=True)
    g = await _group(db, user, "Alimentación")
    t = await _type(db, user, "Supermercado", g)
    await _movement(db, user, -80, t)  # refund: money < 0 → +80

    balances = await _compute_balances(db, user.id)
    assert balances[main.id] == pytest.approx(80.0)


async def test_linked_account_gets_movement_sum(db, user):
    """Movements of a type linked to a savings account should set that account's balance."""
    await _account(db, user, "Principal", is_main=True)
    savings = await _account(db, user, "Ahorro", is_main=False)
    g = await _group(db, user, "Ahorro")
    t = await _type(db, user, "Ahorro mensual", g, linked_account=savings)
    await _movement(db, user, 500, t)

    balances = await _compute_balances(db, user.id)
    assert balances[savings.id] == pytest.approx(500.0)


async def test_linked_account_reduces_main(db, user):
    """A savings movement also reduces the main account (money leaves checking)."""
    main = await _account(db, user, "Principal", is_main=True)
    savings = await _account(db, user, "Ahorro", is_main=False)
    g = await _group(db, user, "Ahorro")
    t = await _type(db, user, "Ahorro mensual", g, linked_account=savings)
    await _movement(db, user, 500, t)

    balances = await _compute_balances(db, user.id)
    assert balances[main.id] == pytest.approx(-500.0)
    assert balances[savings.id] == pytest.approx(500.0)


async def test_multiple_movements_sum(db, user):
    """Balance must be the sum of all eligible movements."""
    main = await _account(db, user, "Principal", is_main=True)
    gi = await _group(db, user, "Ingreso")
    ge = await _group(db, user, "Gasto")
    ti = await _type(db, user, "Nómina", gi)
    te = await _type(db, user, "Supermercado", ge)
    await _movement(db, user, 2000, ti)   # +2000
    await _movement(db, user, 300, te)    # -300
    await _movement(db, user, -50, te)    # refund → +50
    await _movement(db, user, 100, te, no_count=True)  # excluded

    balances = await _compute_balances(db, user.id)
    assert balances[main.id] == pytest.approx(2000 - 300 + 50)


async def test_no_main_account_returns_zeros(db, user):
    """If there are no main accounts, all balances should be zero."""
    acc = await _account(db, user, "Ahorro", is_main=False)

    balances = await _compute_balances(db, user.id)
    assert balances[acc.id] == pytest.approx(0.0)
