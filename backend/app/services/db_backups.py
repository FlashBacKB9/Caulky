"""Copias diarias de la base de datos y volver a una (Ajustes → Copia de seguridad).

Quién hace qué:

* El contenedor ``db-backup`` (docker-compose) hace un ``pg_dump -Fc`` al día en el
  volumen ``/backups`` (``caulky_AAAAMMDD_HHMMSS.dump``) y conserva las 14 últimas. Es el
  único con las herramientas de Postgres 16, así que también es el que restaura.
* Volver a una copia: el backend deja su nombre en ``/backups/restaurar/pedido`` y el
  proceso sale para que Docker lo levante otra vez (``restart: unless-stopped``).
  ``db-backup`` hace antes una copia de «ahora» (``caulky_antes-de-restaurar_…``), carga
  la elegida en una base nueva y solo si sale bien la cambia por la actual (la de antes
  queda como ``spendly_anterior`` hasta la siguiente restauración). Deja el resultado en
  ``/backups/restaurar/estado``.
* Al arrancar, el contenedor del backend espera a que no quede pedido **antes** de
  ``alembic upgrade head`` (``python -m app.services.db_backups wait`` en el CMD del
  Dockerfile): así las migraciones que le falten a una copia antigua se aplican sobre la
  base ya restaurada.

Este módulo no importa nada de la base de datos: se usa también antes de las migraciones.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

BACKUP_DIR = Path(os.environ.get("BACKUP_DIR", "/backups"))
KEEP_DAILY = 14            # lo poda db-backup; aquí solo se informa
KEEP_SAFETY = 5
STALE_HOURS = 48           # la última copia diaria no debería ser más vieja que esto
RESTORE_WAIT_SECONDS = 30 * 60

_NAME = re.compile(r"^caulky_(antes-de-restaurar_)?(\d{8})_(\d{6})\.dump$")


class BackupError(Exception):
    pass


def restore_dir() -> Path:
    return BACKUP_DIR / "restaurar"


@dataclass
class Copia:
    name: str
    taken_at: str          # ISO, hora local del servidor (sin zona)
    kind: str              # «diaria» | «antes de restaurar»
    size: int
    confirm: str           # lo que hay que escribir para volver a ella


def parse_name(name: str) -> tuple[datetime, str] | None:
    m = _NAME.match(name or "")
    if not m:
        return None
    try:
        when = datetime.strptime(m.group(2) + m.group(3), "%Y%m%d%H%M%S")
    except ValueError:
        return None
    return when, ("antes de restaurar" if m.group(1) else "diaria")


def confirm_label(name: str) -> str:
    """Lo que hay que escribir para confirmar: la fecha de la copia, dd/mm/aaaa."""
    p = parse_name(name)
    return p[0].strftime("%d/%m/%Y") if p else ""


def available() -> bool:
    return BACKUP_DIR.is_dir()


def copies() -> list[Copia]:
    out = []
    try:
        for p in BACKUP_DIR.glob("caulky_*.dump"):
            parsed = parse_name(p.name)
            if parsed and p.is_file():
                out.append(Copia(p.name, parsed[0].isoformat(timespec="seconds"), parsed[1],
                                 p.stat().st_size, confirm_label(p.name)))
    except OSError:
        return []
    return sorted(out, key=lambda c: c.taken_at, reverse=True)


def overview(now: datetime | None = None) -> dict:
    now = now or datetime.now()
    items = copies()
    daily = [c for c in items if c.kind == "diaria"]
    last = datetime.fromisoformat(daily[0].taken_at) if daily else None
    stale = available() and (last is None or (now - last).total_seconds() > STALE_HOURS * 3600)
    return {
        "available": available(),
        "items": [asdict(c) for c in items],
        "keep_daily": KEEP_DAILY,
        "keep_safety": KEEP_SAFETY,
        "location": "Volumen de Docker «backup_data» del servidor (/backups)",
        "last_daily": last.isoformat(timespec="seconds") if last else None,
        "stale": stale,
        "restore": restore_status(),
    }


def file_path(name: str) -> Path:
    if not parse_name(name):
        raise BackupError("Esa copia no existe")
    p = BACKUP_DIR / name
    if not p.is_file():
        raise BackupError("Esa copia no existe")
    return p


# ── Restaurar ─────────────────────────────────────────────────────────────────

def restore_status() -> dict | None:
    d = restore_dir()
    pending = (d / "pedido").is_file()
    data = None
    try:
        data = json.loads((d / "estado").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    if data is None and not pending:
        return None
    out = dict(data or {})
    out["pending"] = pending
    return out


def request_restore(name: str, confirm: str) -> None:
    if not available():
        raise BackupError("Las copias diarias solo están en la instalación con Docker")
    file_path(name)
    if (confirm or "").strip() != confirm_label(name):
        raise BackupError(f"Para confirmar escribe la fecha de la copia: {confirm_label(name)}")
    d = restore_dir()
    d.mkdir(parents=True, exist_ok=True)
    if (d / "pedido").exists():
        raise BackupError("Ya hay una restauración en marcha")
    (d / "estado").unlink(missing_ok=True)
    tmp = d / "pedido.tmp"
    tmp.write_text(name + "\n", encoding="utf-8")
    tmp.replace(d / "pedido")
    logger.warning("Copias: pedida la restauración de %s", name)


def schedule_restart(delay: float = 1.0) -> bool:
    """En Docker (RESTORE_SELF_RESTART=1) el proceso sale y `restart: unless-stopped` lo
    levanta; al arrancar espera a que db-backup acabe y aplica las migraciones."""
    if os.environ.get("RESTORE_SELF_RESTART") != "1":
        return False
    asyncio.get_running_loop().call_later(delay, os._exit, 0)
    return True


def wait_for_restore(sleep=time.sleep) -> dict | None:
    """Si hay un pedido, espera (como mucho 30 min) a que db-backup lo termine."""
    pedido = restore_dir() / "pedido"
    if not pedido.exists():
        return None
    print("[copias] hay una restauración en marcha: espero a que acabe", flush=True)
    waited = 0
    while pedido.exists() and waited < RESTORE_WAIT_SECONDS:
        sleep(2)
        waited += 2
    st = restore_status() or {}
    print(f"[copias] restauración terminada: {st.get('estado') or 'sin estado'}", flush=True)
    return st


if __name__ == "__main__":
    # Dockerfile: `python -m app.services.db_backups wait` antes de `alembic upgrade head`
    if sys.argv[1:] == ["wait"]:
        wait_for_restore()
