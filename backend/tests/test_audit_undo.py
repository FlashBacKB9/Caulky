"""Historial de actividad: qué se registra y deshacer (todo o nada, en pareja, solo admin)."""
import uuid
from datetime import date, datetime

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete as sa_delete, select

from app.database import get_db
from app.main import app
from app.models.account import Account
from app.models.audit_log import AuditLog
from app.models.income_expense_group import IncomeExpenseGroup
from app.models.movement import Movement
from app.models.movement_split import MovementSplit
from app.models.movement_type import MovementType
from app.services import audit
from app.services.credit import sync_credit_charges

PWD = "una-clave-larga"


@pytest_asyncio.fixture
async def client(db):
    async def _get_db():
        yield db
    app.dependency_overrides[get_db] = _get_db
    headers = {"X-Real-IP": f"10.1.0.{uuid.uuid4().int % 250}"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=headers) as c:
        yield c
    app.dependency_overrides.clear()


async def _login(client, email="yo@example.com"):
    """El primer usuario real es el administrador."""
    await client.post("/api/auth/register", json={"email": email, "password": PWD})
    r = await client.post("/api/auth/login", data={"username": email, "password": PWD})
    assert r.status_code == 204, r.text


async def _setup(client):
    """Grupo, dos tipos y una cuenta, creados por la API."""
    g = (await client.post("/api/groups", json={"name": "Gastos", "color": "#000"})).json()
    t1 = (await client.post("/api/movement-types", json={
        "name": "Super", "category": "Gastos", "income_expense_group_id": g["id"]})).json()
    t2 = (await client.post("/api/movement-types", json={
        "name": "Limpieza", "category": "Gastos", "income_expense_group_id": g["id"]})).json()
    return t1["id"], t2["id"]


async def _ops(client):
    r = await client.get("/api/audit-log/operations")
    assert r.status_code == 200, r.text
    return r.json()["operations"]


def _mv(**kw):
    return {"name": "Mercadona", "money": 12.3, "date": "2026-11-10", **kw}


# ── qué se registra ───────────────────────────────────────────────────────────

async def test_create_is_one_operation_with_summary_and_row(client, db):
    await _login(client)
    t1, _ = await _setup(client)
    mv = (await client.post("/api/movements", json=_mv(movement_type_id=t1))).json()
    op = (await _ops(client))[0]
    assert op["summaries"][0]["summary"].startswith("Movimiento creado: Mercadona")
    assert op["source"] == "web"
    assert op["state"] == "ok"
    [row] = [r for r in op["rows"] if r["table"] == "movements"]
    assert row["action"] == "insert" and row["row_id"] == str(mv["id"])
    assert row["data"]["money"] == 12.3


async def test_update_keeps_previous_value(client):
    await _login(client)
    t1, _ = await _setup(client)
    mv = (await client.post("/api/movements", json=_mv(movement_type_id=t1))).json()
    await client.put(f"/api/movements/{mv['id']}", json={"money": 20})
    op = (await _ops(client))[0]
    [row] = [r for r in op["rows"] if r["table"] == "movements"]
    assert row["action"] == "update"
    assert row["changes"]["money"] == [12.3, 20.0]


# ── deshacer ──────────────────────────────────────────────────────────────────

async def test_undo_create_deletes_it(client, db):
    await _login(client)
    t1, _ = await _setup(client)
    mv = (await client.post("/api/movements", json=_mv(movement_type_id=t1))).json()
    op = (await _ops(client))[0]
    r = await client.post("/api/audit-log/undo", json={"group_id": op["group_id"]})
    assert r.status_code == 200, r.text
    assert await db.get(Movement, mv["id"]) is None
    ops = await _ops(client)
    assert ops[0]["source"] == "undo" and ops[0]["state"] == "undo"
    assert ops[0]["summaries"][0]["summary"].startswith("Deshecho: Movimiento creado")
    assert ops[1]["state"] == "done"
    # Lo ya deshecho no se vuelve a deshacer
    r = await client.post("/api/audit-log/undo", json={"group_id": op["group_id"]})
    assert r.json() == {"undone": 0}


async def test_undo_update_restores_value(client, db):
    await _login(client)
    t1, _ = await _setup(client)
    mv = (await client.post("/api/movements", json=_mv(movement_type_id=t1, notes="hola"))).json()
    await client.put(f"/api/movements/{mv['id']}", json={"money": 20, "notes": None})
    op = (await _ops(client))[0]
    assert (await client.post("/api/audit-log/undo", json={"group_id": op["group_id"]})).status_code == 200
    db.expire_all()
    m = await db.get(Movement, mv["id"])
    assert float(m.money) == 12.3 and m.notes == "hola"


async def test_undo_delete_brings_back_movement_and_its_splits_with_same_ids(client, db):
    await _login(client)
    t1, t2 = await _setup(client)
    mv = (await client.post("/api/movements", json=_mv(money=0, splits=[
        {"movement_type_id": t1, "money": 10}, {"movement_type_id": t2, "money": 5}]))).json()
    split_ids = sorted((await db.execute(
        select(MovementSplit.id).where(MovementSplit.movement_id == mv["id"]))).scalars())
    assert len(split_ids) == 2
    assert (await client.delete(f"/api/movements/{mv['id']}")).status_code == 204
    db.expire_all()
    assert await db.get(Movement, mv["id"]) is None

    op = (await _ops(client))[0]
    assert {(r["table"], r["action"]) for r in op["rows"]} == {("movements", "delete"), ("movement_splits", "delete")}
    assert (await client.post("/api/audit-log/undo", json={"group_id": op["group_id"]})).status_code == 200
    db.expire_all()
    back = await db.get(Movement, mv["id"])
    assert back is not None and float(back.money) == 15
    assert sorted((await db.execute(
        select(MovementSplit.id).where(MovementSplit.movement_id == mv["id"]))).scalars()) == split_ids


async def test_row_undo_takes_its_pair_along(client, db):
    """Deshacer solo una parte de un movimiento dividido deshace el movimiento entero."""
    await _login(client)
    t1, t2 = await _setup(client)
    mv = (await client.post("/api/movements", json=_mv(money=0, splits=[
        {"movement_type_id": t1, "money": 10}, {"movement_type_id": t2, "money": 5}]))).json()
    op = (await _ops(client))[0]
    split_row = next(r for r in op["rows"] if r["table"] == "movement_splits")
    assert op["bundles"] == 1
    r = await client.post("/api/audit-log/undo", json={"ids": [split_row["id"]]})
    assert r.status_code == 200, r.text
    db.expire_all()
    assert await db.get(Movement, mv["id"]) is None
    assert (await db.execute(select(MovementSplit).where(MovementSplit.movement_id == mv["id"]))).first() is None


async def test_independent_rows_are_separate_bundles(client, db):
    """Un borrado masivo de dos movimientos sin relación: se puede deshacer uno solo."""
    await _login(client)
    t1, _ = await _setup(client)
    a = (await client.post("/api/movements", json=_mv(name="A", movement_type_id=t1))).json()
    b = (await client.post("/api/movements", json=_mv(name="B", movement_type_id=t1))).json()
    await db.execute(sa_delete(Movement).where(Movement.id.in_([a["id"], b["id"]])))
    await db.commit()
    op = (await _ops(client))[0]
    assert op["bundles"] == 2 and op["source"] == "auto"
    row_a = next(r for r in op["rows"] if r["row_id"] == str(a["id"]))
    assert (await client.post("/api/audit-log/undo", json={"ids": [row_a["id"]]})).status_code == 200
    db.expire_all()
    assert await db.get(Movement, a["id"]) is not None
    assert await db.get(Movement, b["id"]) is None
    assert (await _ops(client))[1]["state"] == "partial"


async def test_later_change_blocks_and_nothing_is_touched(client, db):
    await _login(client)
    t1, _ = await _setup(client)
    mv = (await client.post("/api/movements", json=_mv(movement_type_id=t1))).json()
    created = (await _ops(client))[0]
    await client.put(f"/api/movements/{mv['id']}", json={"money": 20})
    r = await client.post("/api/audit-log/undo", json={"group_id": created["group_id"]})
    assert r.status_code == 409
    assert "cambió después" in r.json()["detail"]["problems"][0]
    db.expire_all()
    assert float((await db.get(Movement, mv["id"])).money) == 20
    # Deshaciendo primero el cambio, ya se puede deshacer el alta
    edited = (await _ops(client))[0]
    assert (await client.post("/api/audit-log/undo", json={"group_id": edited["group_id"]})).status_code == 200
    assert (await client.post("/api/audit-log/undo", json={"group_id": created["group_id"]})).status_code == 200
    db.expire_all()
    assert await db.get(Movement, mv["id"]) is None


async def test_value_changed_outside_history_blocks(client, db):
    """Si la fila no está como la dejó la operación (cambio sin registrar), no se pisa."""
    await _login(client)
    t1, _ = await _setup(client)
    mv = (await client.post("/api/movements", json=_mv(movement_type_id=t1))).json()
    await client.put(f"/api/movements/{mv['id']}", json={"money": 20})
    op = (await _ops(client))[0]
    db.info["audit_skip"] = True
    (await db.get(Movement, mv["id"])).money = 99
    await db.commit()
    db.info.pop("audit_skip")
    r = await client.post("/api/audit-log/undo", json={"group_id": op["group_id"]})
    assert r.status_code == 409 and "importe cambió después" in r.json()["detail"]["problems"][0]


async def test_card_settlement_and_cycle_mark_go_together(client, db):
    """La liquidación de tarjeta y la marca de ciclo cobrado de la tarjeta son un bloque:
    deshacer solo la liquidación devuelve también la marca (si no, se regeneraría sola)."""
    await _login(client)
    from app.models.user import User
    me = (await db.execute(select(User))).scalars().first()
    main = Account(name="Principal", color="#000", icon="wallet", initial_balance=1000,
                   sort_order=0, is_main=True, user_id=me.id)
    card = Account(name="Visa", color="#000", icon="card", initial_balance=0, sort_order=1,
                   is_main=False, category="credito", credit_limit=1500, credit_cutoff_day=31,
                   credit_charge_day=5, credit_auto_charge=True, credit_last_cycle_end=date(2026, 8, 31),
                   user_id=me.id)
    g = IncomeExpenseGroup(name="Gastos", color="#000", user_id=me.id)
    db.add_all([main, card, g])
    await db.flush()
    t = MovementType(name="Super", category="Gastos", income_expense_group_id=g.id, user_id=me.id)
    db.add(t)
    await db.flush()
    db.add(Movement(name="compra", money=100, date=date(2026, 9, 3), movement_type_id=t.id,
                    account_id=card.id, paid=True, no_count=False, is_shared=False, user_id=me.id))
    await db.commit()

    card_id = card.id
    assert await sync_credit_charges(db, me.id, today=date(2026, 10, 5)) == 1
    op = (await _ops(client))[0]
    tables = {(r["table"], r["action"]) for r in op["rows"]}
    assert ("movements", "insert") in tables and ("accounts", "update") in tables
    settle = next(r for r in op["rows"] if r["table"] == "movements" and r["action"] == "insert")
    acc = next(r for r in op["rows"] if r["table"] == "accounts")
    assert settle["bundle"] == acc["bundle"]

    assert (await client.post("/api/audit-log/undo", json={"ids": [settle["id"]]})).status_code == 200
    db.expire_all()
    assert (await db.get(Account, card_id)).credit_last_cycle_end == date(2026, 8, 31)
    assert (await db.execute(select(Movement).where(Movement.credit_cycle_end.is_not(None)))).first() is None


async def test_old_entries_say_they_cannot_be_undone(client, db):
    await _login(client)
    from app.models.user import User
    me = (await db.execute(select(User))).scalars().first()
    db.add(AuditLog(user_id=me.id, created_at=datetime(2026, 1, 1), entity_type="movement", entity_id=1,
                    action="delete", summary="Movimiento eliminado: viejo", source="user"))
    await db.commit()
    op = next(o for o in await _ops(client) if o["summaries"] and o["summaries"][0]["summary"].endswith("viejo"))
    assert op["state"] == "old" and "antes de poder deshacer" in op["reason"]
    assert op["group_id"] is None


# ── quién puede ───────────────────────────────────────────────────────────────

async def test_api_key_cannot_undo(client):
    await _login(client)
    t1, _ = await _setup(client)
    await client.post("/api/movements", json=_mv(movement_type_id=t1))
    op = (await _ops(client))[0]
    key = (await client.post("/api/api-keys", json={"name": "bot"})).json()["key"]
    client.cookies.clear()
    r = await client.post("/api/audit-log/undo", json={"group_id": op["group_id"]},
                          headers={"Authorization": f"Bearer {key}"})
    assert r.status_code in (401, 403)
    # Lo hecho con la clave sí queda registrado como «api»
    await client.post("/api/movements", json=_mv(movement_type_id=t1), headers={"Authorization": f"Bearer {key}"})
    r = await client.get("/api/audit-log/operations", headers={"Authorization": f"Bearer {key}"})
    assert r.json()["operations"][0]["source"] == "api"


async def test_non_admin_cannot_undo(client, db):
    await _login(client)                         # admin
    client.cookies.clear()
    from app.services.admin import REGISTRATION_OPEN, set_flag
    await set_flag(db, REGISTRATION_OPEN, True)
    await db.commit()
    await _login(client, "otro@example.com")
    t1, _ = await _setup(client)
    await client.post("/api/movements", json=_mv(movement_type_id=t1))
    op = (await _ops(client))[0]
    r = await client.post("/api/audit-log/undo", json={"group_id": op["group_id"]})
    assert r.status_code == 403


async def test_bundles_link_ticket_to_generated_movements():
    mv = AuditLog(id=1, table_name="movements", row_id="7", action="insert", after='{"id": 7}')
    other = AuditLog(id=2, table_name="movements", row_id="8", action="insert", after='{"id": 8}')
    tk = AuditLog(id=3, table_name="tickets", row_id="3", action="update",
                  before='{"generated_movements": null}',
                  after='{"id": 3, "generated_movements": "{\\"total\\": 7}"}')
    b = audit.bundles([mv, other, tk])
    assert b[1] == b[3] and b[2] != b[1]
