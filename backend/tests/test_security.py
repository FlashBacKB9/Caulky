"""Administrador, registro cerrado, terminal solo para admin, límite de logins y su registro."""
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.database import get_db
from app.main import app
from app.models.account import Account
from app.models.income_expense_group import IncomeExpenseGroup
from app.models.user import User
from app.services.admin import DEMO_EMAIL, ensure_admin

PWD = "una-clave-larga"


@pytest_asyncio.fixture
async def client(db):
    async def _get_db():
        yield db
    app.dependency_overrides[get_db] = _get_db
    # Cada test con su IP, para que el límite de intentos no se arrastre entre tests
    headers = {"X-Real-IP": f"10.0.0.{uuid.uuid4().int % 250}"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=headers) as c:
        yield c
    app.dependency_overrides.clear()


async def _register(client, email):
    return await client.post("/api/auth/register", json={"email": email, "password": PWD})


async def _login(client, email, password=PWD):
    return await client.post("/api/auth/login", data={"username": email, "password": password})


# ── administrador y registro ──────────────────────────────────────────────────

async def test_first_real_user_is_admin_and_registration_closes(client, db):
    assert (await client.get("/api/admin/public-settings")).json() == {"registration_open": True}
    assert (await _register(client, "yo@example.com")).status_code == 201
    me = (await db.execute(select(User).where(User.email == "yo@example.com"))).scalar_one()
    assert me.is_superuser
    assert (await client.get("/api/admin/public-settings")).json() == {"registration_open": False}
    assert (await _register(client, "otro@example.com")).status_code == 403


async def test_admin_can_reopen_registration(client):
    await _register(client, "yo@example.com")
    await _login(client, "yo@example.com")
    r = await client.put("/api/admin/settings", json={"registration_open": True, "ai_terminal_enabled": True})
    assert r.status_code == 200
    assert (await _register(client, "otro@example.com")).status_code == 201


async def test_demo_user_does_not_count_and_is_never_admin(db):
    demo = User(id=uuid.uuid4(), email=DEMO_EMAIL, hashed_password="x", is_active=True)
    real = User(id=uuid.uuid4(), email="zz@example.com", hashed_password="x", is_active=True)
    db.add_all([demo, real])
    await db.flush()
    # el demo tiene la cuenta más antigua, pero no puede ser admin
    db.add(Account(name="A", color="#000", icon="w", initial_balance=0, sort_order=0, is_main=True, user_id=demo.id))
    await db.commit()
    assert (await ensure_admin(db)).email == "zz@example.com"


async def test_admin_is_the_owner_of_the_oldest_account(db):
    a = User(id=uuid.uuid4(), email="a@example.com", hashed_password="x", is_active=True)
    b = User(id=uuid.uuid4(), email="b@example.com", hashed_password="x", is_active=True)
    db.add_all([a, b])
    await db.flush()
    db.add(Account(name="B", color="#000", icon="w", initial_balance=0, sort_order=0, is_main=True, user_id=b.id))
    await db.flush()
    db.add(Account(name="A", color="#000", icon="w", initial_balance=0, sort_order=0, is_main=True, user_id=a.id))
    await db.commit()
    assert (await ensure_admin(db)).email == "b@example.com"


async def test_non_admin_cannot_change_settings_or_claim_orphans(client, db):
    await _register(client, "yo@example.com")
    await _login(client, "yo@example.com")
    await client.put("/api/admin/settings", json={"registration_open": True, "ai_terminal_enabled": True})
    await client.post("/api/auth/logout")
    await _register(client, "otro@example.com")
    orphan = IncomeExpenseGroup(name="Huérfano", color="#000", user_id=None)
    db.add(orphan)
    await db.commit()

    await _login(client, "otro@example.com")
    r = await client.put("/api/admin/settings", json={"registration_open": True, "ai_terminal_enabled": True})
    assert r.status_code == 403
    assert (await client.post("/api/admin/claim")).status_code == 200
    await db.refresh(orphan)
    assert orphan.user_id is None


# ── terminal del Consultor IA ─────────────────────────────────────────────────

async def test_terminal_only_for_admin_and_when_enabled(client):
    await _register(client, "yo@example.com")
    await _login(client, "yo@example.com")
    assert (await client.post("/api/ai/terminal/ticket", json={})).status_code == 200
    await client.put("/api/admin/settings", json={"registration_open": True, "ai_terminal_enabled": False})
    assert (await client.post("/api/ai/terminal/ticket", json={})).status_code == 403
    await client.put("/api/admin/settings", json={"registration_open": True, "ai_terminal_enabled": True})
    await client.post("/api/auth/logout")

    await _register(client, "otro@example.com")
    await _login(client, "otro@example.com")
    assert (await client.post("/api/ai/terminal/ticket", json={})).status_code == 403
    assert (await client.get("/api/ai/workspace/files")).status_code == 403


# ── límite de intentos y registro de logins ───────────────────────────────────

async def test_login_rate_limit_after_five_failures(client):
    await _register(client, "yo@example.com")
    for _ in range(5):
        assert (await _login(client, "yo@example.com", "mala")).status_code == 400
    r = await _login(client, "yo@example.com")
    assert r.status_code == 429 and "Retry-After" in r.headers
    # otra IP no está bloqueada
    assert (await client.post("/api/auth/login", data={"username": "yo@example.com", "password": PWD},
                              headers={"X-Real-IP": "10.9.9.9"})).status_code == 204


async def test_logins_are_logged(client, monkeypatch):
    calls = []

    async def fake_log(user_id, entity_type, entity_id, action, summary, **_):
        calls.append((action, summary))
    monkeypatch.setattr("app.auth.manager.write_log", fake_log)

    await _register(client, "yo@example.com")
    await _login(client, "yo@example.com", "mala")
    await _login(client, "nadie@example.com", "mala")
    await _login(client, "yo@example.com")
    actions = [a for a, _ in calls]
    assert actions == ["login_failed", "login_failed", "login"]
    assert "nadie@example.com" in calls[1][1]


# ── IDs de otro usuario ───────────────────────────────────────────────────────

async def _two_users_with_types(db):
    from app.models.movement_type import MovementType
    a = User(id=uuid.uuid4(), email="a@example.com", hashed_password="x", is_active=True)
    b = User(id=uuid.uuid4(), email="b@example.com", hashed_password="x", is_active=True)
    db.add_all([a, b])
    await db.flush()
    ga = IncomeExpenseGroup(name="Gastos A", color="#000", user_id=a.id)
    gb = IncomeExpenseGroup(name="Gastos B", color="#000", user_id=b.id)
    acc_a = Account(name="Cuenta A", color="#000", icon="w", initial_balance=0, sort_order=0, is_main=True, user_id=a.id)
    db.add_all([ga, gb, acc_a])
    await db.flush()
    ta = MovementType(name="Tipo A", category="X", income_expense_group_id=ga.id, user_id=a.id)
    tb = MovementType(name="Tipo B", category="X", income_expense_group_id=gb.id, user_id=b.id)
    db.add_all([ta, tb])
    await db.commit()
    return a, b, ta, tb, ga, acc_a


@pytest.mark.parametrize("field", ["movement_type_id", "account_id", "from_account_id"])
async def test_movement_cannot_point_to_foreign_rows(db, field):
    from datetime import date
    from fastapi import HTTPException
    from app.routers.movements import create_movement
    from app.schemas.movement import MovementCreate
    a, b, ta, tb, ga, acc_a = await _two_users_with_types(db)
    value = ta.id if field == "movement_type_id" else acc_a.id
    with pytest.raises(HTTPException) as e:
        await create_movement(MovementCreate(name="x", money=1, date=date(2026, 1, 1), **{field: value}), db, b)
    assert e.value.status_code == 400


async def test_type_cannot_use_foreign_group(db):
    from fastapi import HTTPException
    from app.routers.movement_types import update_type
    from app.schemas.movement_type import MovementTypeUpdate
    a, b, ta, tb, ga, acc_a = await _two_users_with_types(db)
    with pytest.raises(HTTPException) as e:
        await update_type(tb.id, MovementTypeUpdate(name="Tipo B", category="X", income_expense_group_id=ga.id), db, b)
    assert e.value.status_code == 400


async def test_restore_drops_foreign_ids(db):
    from app.models.investment import InvestmentPurchase
    from app.models.movement import Movement
    from app.routers.backup import RestorePayload, restore_backup
    a, b, ta, tb, ga, acc_a = await _two_users_with_types(db)
    mv_a = Movement(name="de A", money=1, date=__import__("datetime").date(2026, 1, 1), user_id=a.id)
    db.add(mv_a)
    await db.commit()
    payload = RestorePayload(version="2", restore_movements=True, restore_investments=True, db={
        "movements": [{"id": 1, "name": "m", "money": 5, "date": "2026-01-01", "movement_type_id": ta.id,
                       "account_id": acc_a.id, "paid": True, "no_count": False}],
        "investment_funds": [],
        "investment_purchases": [{"id": 1, "movement_id": mv_a.id, "units": 1, "price_at_purchase": 1}],
    })
    await restore_backup(payload, db=db, user=b)
    mine = (await db.execute(select(Movement).where(Movement.user_id == b.id))).scalar_one()
    assert mine.movement_type_id is None and mine.account_id is None
    assert (await db.execute(select(InvestmentPurchase).where(InvestmentPurchase.movement_id == mv_a.id))).first() is None
