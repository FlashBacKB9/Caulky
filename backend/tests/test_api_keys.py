from datetime import datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.auth.api_key import generate_key, hash_key
from app.database import get_db
from app.main import app
from app.models.api_key import ApiKey


@pytest_asyncio.fixture
async def client(db):
    async def _get_db():
        yield db
    app.dependency_overrides[get_db] = _get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def key(db, user):
    raw = generate_key()
    db.add(ApiKey(user_id=user.id, name="test", prefix=raw[:10],
                  key_hash=hash_key(raw), created_at=datetime.utcnow()))
    await db.commit()
    return raw


@pytest.mark.asyncio
async def test_la_clave_da_acceso_a_los_datos(client, key, db):
    r = await client.get("/api/preferences", headers={"Authorization": f"Bearer {key}"})
    assert r.status_code == 200
    r = await client.put("/api/preferences/foo", json={"value": "bar"},
                         headers={"Authorization": f"Bearer {key}"})
    assert r.status_code < 300
    api_key = (await db.execute(ApiKey.__table__.select())).first()
    assert api_key.last_used_at is not None


@pytest.mark.asyncio
async def test_clave_invalida_o_ausente(client, key):
    assert (await client.get("/api/preferences", headers={"Authorization": "Bearer ck_nope"})).status_code == 401
    assert (await client.get("/api/preferences")).status_code == 401


@pytest.mark.asyncio
async def test_la_clave_no_gestiona_claves_ni_la_cuenta(client, key):
    h = {"Authorization": f"Bearer {key}"}
    assert (await client.get("/api/api-keys", headers=h)).status_code == 401
    assert (await client.post("/api/api-keys", json={"name": "x"}, headers=h)).status_code == 401
    assert (await client.post("/api/backup/reset", headers=h)).status_code == 401
    assert (await client.patch("/api/users/me", json={"password": "x"}, headers=h)).status_code == 403


@pytest.mark.asyncio
async def test_flujo_completo_desde_la_sesion(client):
    creds = {"email": "flow@example.com", "password": "una-clave-larga"}
    assert (await client.post("/api/auth/register", json=creds)).status_code == 201
    r = await client.post("/api/auth/login", data={"username": creds["email"], "password": creds["password"]})
    assert r.status_code == 204

    r = await client.post("/api/api-keys", json={"name": "script"})
    assert r.status_code == 201
    raw = r.json()["key"]
    assert raw.startswith("ck_") and "key_hash" not in r.json()

    listed = (await client.get("/api/api-keys")).json()
    assert [k["name"] for k in listed] == ["script"] and "key" not in listed[0]

    client.cookies.clear()
    h = {"Authorization": f"Bearer {raw}"}
    assert (await client.get("/api/preferences", headers=h)).status_code == 200

    await client.post("/api/auth/login", data={"username": creds["email"], "password": creds["password"]})
    assert (await client.delete(f"/api/api-keys/{listed[0]['id']}")).status_code == 204
    client.cookies.clear()
    assert (await client.get("/api/preferences", headers=h)).status_code == 401
