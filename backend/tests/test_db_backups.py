"""Copias diarias de la base: listado, pedir volver a una y quién puede."""
import json
import uuid
from datetime import datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.main import app
from app.services import db_backups

PWD = "una-clave-larga"


@pytest.fixture
def backups(tmp_path, monkeypatch):
    monkeypatch.setattr(db_backups, "BACKUP_DIR", tmp_path)
    monkeypatch.delenv("RESTORE_SELF_RESTART", raising=False)
    for name in ("caulky_20261114_030000.dump", "caulky_20261113_030000.dump",
                 "caulky_antes-de-restaurar_20261110_101500.dump", "otra_cosa.dump",
                 "caulky_20261115_030000.dump.part"):
        (tmp_path / name).write_bytes(b"x" * 10)
    return tmp_path


@pytest_asyncio.fixture
async def client(db):
    async def _get_db():
        yield db
    app.dependency_overrides[get_db] = _get_db
    headers = {"X-Real-IP": f"10.2.0.{uuid.uuid4().int % 250}"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=headers) as c:
        yield c
    app.dependency_overrides.clear()


async def _login(client, email="yo@example.com"):
    await client.post("/api/auth/register", json={"email": email, "password": PWD})
    r = await client.post("/api/auth/login", data={"username": email, "password": PWD})
    assert r.status_code == 204


def test_names_and_confirm_label():
    assert db_backups.parse_name("caulky_20261114_030000.dump")[1] == "diaria"
    assert db_backups.parse_name("caulky_antes-de-restaurar_20261110_101500.dump")[1] == "antes de restaurar"
    assert db_backups.parse_name("caulky_20261114_030000.dump.part") is None
    assert db_backups.parse_name("../caulky_20261114_030000.dump") is None
    assert db_backups.confirm_label("caulky_20261114_030000.dump") == "14/11/2026"


def test_overview_lists_only_finished_copies_newest_first(backups):
    o = db_backups.overview(now=datetime(2026, 11, 15, 10, 0))
    assert [c["name"] for c in o["items"]] == [
        "caulky_20261114_030000.dump", "caulky_20261113_030000.dump",
        "caulky_antes-de-restaurar_20261110_101500.dump"]
    assert o["available"] and not o["stale"]
    assert db_backups.overview(now=datetime(2026, 11, 17, 4, 0))["stale"]


def test_not_available_without_volume(tmp_path, monkeypatch):
    monkeypatch.setattr(db_backups, "BACKUP_DIR", tmp_path / "no-existe")
    o = db_backups.overview()
    assert o["available"] is False and o["items"] == [] and o["stale"] is False
    with pytest.raises(db_backups.BackupError):
        db_backups.request_restore("caulky_20261114_030000.dump", "14/11/2026")


def test_request_restore_needs_the_date_and_only_once(backups):
    with pytest.raises(db_backups.BackupError, match="14/11/2026"):
        db_backups.request_restore("caulky_20261114_030000.dump", "13/11/2026")
    with pytest.raises(db_backups.BackupError):
        db_backups.request_restore("caulky_20261199_030000.dump", "")
    db_backups.request_restore("caulky_20261114_030000.dump", " 14/11/2026 ")
    assert (backups / "restaurar" / "pedido").read_text().strip() == "caulky_20261114_030000.dump"
    assert db_backups.restore_status() == {"pending": True}
    with pytest.raises(db_backups.BackupError, match="en marcha"):
        db_backups.request_restore("caulky_20261113_030000.dump", "13/11/2026")


def test_wait_for_restore_waits_until_db_backup_finishes(backups):
    d = backups / "restaurar"
    d.mkdir()
    (d / "pedido").write_text("caulky_20261114_030000.dump\n")
    calls = []

    def fake_sleep(_s):
        calls.append(1)
        if len(calls) == 3:   # db-backup termina
            (d / "pedido").unlink()
            (d / "estado").write_text(json.dumps({"estado": "ok", "fichero": "caulky_20261114_030000.dump"}))
    st = db_backups.wait_for_restore(sleep=fake_sleep)
    assert len(calls) == 3 and st["estado"] == "ok" and st["pending"] is False
    assert db_backups.wait_for_restore(sleep=fake_sleep) is None   # sin pedido no espera


async def test_admin_lists_and_restores_with_browser_session(client, backups):
    await _login(client)
    r = await client.get("/api/db-backups")
    assert r.status_code == 200 and len(r.json()["items"]) == 3
    r = await client.post("/api/db-backups/restore", json={"name": "caulky_20261114_030000.dump", "confirm": "1/1/2000"})
    assert r.status_code == 400 and "14/11/2026" in r.json()["detail"]
    r = await client.post("/api/db-backups/restore", json={"name": "caulky_20261114_030000.dump", "confirm": "14/11/2026"})
    assert r.status_code == 202 and r.json() == {"ok": True, "restarting": False}
    assert (backups / "restaurar" / "pedido").exists()
    r = await client.get("/api/db-backups/file/caulky_20261113_030000.dump")
    assert r.status_code == 200 and r.content == b"x" * 10
    assert (await client.get("/api/db-backups/file/..%2Fsecreto.dump")).status_code == 404


async def test_api_key_cannot_restore_nor_download(client, backups):
    await _login(client)
    key = (await client.post("/api/api-keys", json={"name": "bot"})).json()["key"]
    client.cookies.clear()
    h = {"Authorization": f"Bearer {key}"}
    assert (await client.get("/api/db-backups", headers=h)).status_code == 200   # ver sí
    r = await client.post("/api/db-backups/restore", headers=h,
                          json={"name": "caulky_20261114_030000.dump", "confirm": "14/11/2026"})
    assert r.status_code in (401, 403)
    assert (await client.get("/api/db-backups/file/caulky_20261114_030000.dump", headers=h)).status_code in (401, 403)
    assert not (backups / "restaurar" / "pedido").exists()


async def test_non_admin_cannot_see_copies(client, db, backups):
    await _login(client)
    client.cookies.clear()
    from app.services.admin import REGISTRATION_OPEN, set_flag
    await set_flag(db, REGISTRATION_OPEN, True)
    await db.commit()
    await _login(client, "otro@example.com")
    assert (await client.get("/api/db-backups")).status_code == 403
    r = await client.post("/api/db-backups/restore", json={"name": "caulky_20261114_030000.dump", "confirm": "14/11/2026"})
    assert r.status_code == 403
