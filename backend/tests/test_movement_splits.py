from datetime import date

import pytest
from fastapi import HTTPException

from app.models.account import Account
from app.models.income_expense_group import IncomeExpenseGroup
from app.models.movement_type import MovementType
from app.routers.movement_types import delete_type
from app.routers.movements import create_movement, get_movement, update_movement
from app.routers.stats import annual_stats
from app.schemas.movement import MovementCreate, MovementUpdate


async def _types(db, user):
    gastos = IncomeExpenseGroup(name="Vida Diaria", color="#000", user_id=user.id)
    ingreso = IncomeExpenseGroup(name="Ingreso", color="#000", user_id=user.id)
    acc = Account(name="Ahorro", color="#000", icon="piggy", initial_balance=0, sort_order=0,
                  is_main=False, user_id=user.id)
    db.add_all([gastos, ingreso, acc])
    await db.flush()
    super_ = MovementType(name="Super", category="Vida Diaria", income_expense_group_id=gastos.id, user_id=user.id)
    limpieza = MovementType(name="Limpieza", category="Vida Diaria", income_expense_group_id=gastos.id, user_id=user.id)
    nomina = MovementType(name="Nómina", category="Ingreso", income_expense_group_id=ingreso.id, user_id=user.id)
    hucha = MovementType(name="Hucha", category="Ahorro", income_expense_group_id=gastos.id,
                         linked_account_id=acc.id, user_id=user.id)
    db.add_all([super_, limpieza, nomina, hucha])
    await db.commit()
    return super_, limpieza, nomina, hucha


def _body(splits, **kw):
    return MovementCreate(name="Mercadona", money=kw.pop("money", 0), date=date(2026, 10, 3), splits=splits, **kw)


async def test_create_split_sets_total_and_main_type(db, user):
    super_, limpieza, *_ = await _types(db, user)
    mv = await create_movement(_body([
        {"movement_type_id": super_.id, "money": 30.5},
        {"movement_type_id": limpieza.id, "money": 12.25},
    ]), db, user)
    assert mv.money == pytest.approx(42.75)
    assert mv.movement_type_id == super_.id
    assert mv.dinero == pytest.approx(-42.75)
    assert sorted((s.movement_type_id, s.money) for s in mv.splits) == sorted(
        [(super_.id, 30.5), (limpieza.id, 12.25)])


async def test_single_part_is_a_normal_movement(db, user):
    super_, *_ = await _types(db, user)
    mv = await create_movement(_body([{"movement_type_id": super_.id, "money": 10}]), db, user)
    assert mv.splits == [] and mv.movement_type_id == super_.id and mv.money == 10


@pytest.mark.parametrize("bad", ["mixed_income", "linked", "foreign", "mixed_sign"])
async def test_invalid_splits_rejected(db, user, bad):
    super_, limpieza, nomina, hucha = await _types(db, user)
    second = {"mixed_income": nomina.id, "linked": hucha.id, "foreign": 9999, "mixed_sign": limpieza.id}[bad]
    with pytest.raises(HTTPException) as e:
        await create_movement(_body([
            {"movement_type_id": super_.id, "money": 10},
            {"movement_type_id": second, "money": -5 if bad == "mixed_sign" else 5},
        ]), db, user)
    assert e.value.status_code == 400


async def test_update_money_rescales_and_type_change_clears(db, user):
    super_, limpieza, *_ = await _types(db, user)
    mv = await create_movement(_body([
        {"movement_type_id": super_.id, "money": 30},
        {"movement_type_id": limpieza.id, "money": 10},
    ]), db, user)
    mv = await update_movement(mv.id, MovementUpdate(money=20, movement_type_id=super_.id), db, user)
    assert {s.movement_type_id: s.money for s in mv.splits} == {super_.id: 15, limpieza.id: 5}
    mv = await update_movement(mv.id, MovementUpdate(movement_type_id=limpieza.id), db, user)
    assert mv.splits == [] and mv.movement_type_id == limpieza.id and mv.money == 20


async def test_update_replaces_and_clears_splits(db, user):
    super_, limpieza, *_ = await _types(db, user)
    mv = await create_movement(_body([], money=8, movement_type_id=super_.id), db, user)
    mv = await update_movement(mv.id, MovementUpdate(splits=[
        {"movement_type_id": super_.id, "money": 2},
        {"movement_type_id": limpieza.id, "money": 6},
    ]), db, user)
    assert mv.movement_type_id == limpieza.id and len(mv.splits) == 2
    mv = await update_movement(mv.id, MovementUpdate(splits=[]), db, user)
    assert mv.splits == [] and mv.money == 8


async def test_annual_stats_distribute_split(db, user):
    super_, limpieza, *_ = await _types(db, user)
    await create_movement(_body([
        {"movement_type_id": super_.id, "money": 30},
        {"movement_type_id": limpieza.id, "money": 10},
    ]), db, user)
    stats = await annual_stats(2026, db, user)
    by_type = {t["name"]: t["total"] for g in stats["groups"] for t in g["movement_types"]}
    assert by_type["Super"] == pytest.approx(-30)
    assert by_type["Limpieza"] == pytest.approx(-10)


async def test_deleting_a_type_keeps_the_rest_of_the_split(db, user):
    super_, limpieza, *_ = await _types(db, user)
    mv = await create_movement(_body([
        {"movement_type_id": super_.id, "money": 30},
        {"movement_type_id": limpieza.id, "money": 10},
    ]), db, user)
    await delete_type(super_.id, db, user)
    db.expunge_all()
    left = await get_movement(mv.id, db, user)
    assert left.movement_type_id == limpieza.id and left.money == 10 and left.splits == []


async def test_ticket_split_mode_creates_one_divided_movement(db, user):
    import json
    from app.models.ticket import Ticket
    from app.routers.tickets import TicketToMovementRequest, ticket_to_movement
    super_, limpieza, *_ = await _types(db, user)
    t = Ticket(user_id=user.id, original_name="t.jpg", filename="no-existe.jpg", mime_type="image/jpeg",
               store_name="Mercadona", ticket_date=date(2026, 10, 3), items=json.dumps([
                   {"name": "Pan", "amount": 2.5, "category": "Panadería"},
                   {"name": "Lejía", "amount": 1.75, "category": "Limpieza y hogar"},
               ]))
    db.add(t)
    await db.commit()
    res = await ticket_to_movement(t.id, TicketToMovementRequest(
        mode="split", type_id=super_.id, supplies_type_id=limpieza.id), db, user)
    mv = await get_movement(res["movement_id"], db, user)
    assert mv.money == pytest.approx(4.25) and mv.movement_type_id == super_.id
    assert {s.movement_type_id: s.money for s in mv.splits} == {super_.id: 2.5, limpieza.id: 1.75}


async def test_ticket_rejects_foreign_type(db, user):
    import json
    from app.models.ticket import Ticket
    from app.routers.tickets import TicketToMovementRequest, ticket_to_movement
    await _types(db, user)
    t = Ticket(user_id=user.id, original_name="t.jpg", filename="x.jpg", mime_type="image/jpeg",
               items=json.dumps([{"name": "Pan", "amount": 2.5, "category": "Panadería"}]))
    db.add(t)
    await db.commit()
    with pytest.raises(HTTPException):
        await ticket_to_movement(t.id, TicketToMovementRequest(mode="food", type_id=9999), db, user)
