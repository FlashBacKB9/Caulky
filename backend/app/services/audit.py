"""Historial de actividad (Ajustes → Sistema) y deshacer.

Dos clases de entrada en `audit_logs`, unidas por `group_id` (una transacción = una
operación):

- **Resumen** (`table_name` vacío): la frase legible que escribe cada endpoint con
  `write_log` («Movimiento creado: Mercadona 12,30€ | Cuenta: 100 → 87,70»).
- **Fila** (`table_name` puesto): lo que los listeners de SQLAlchemy ven cambiar en
  cualquier tabla, sin tocar los routers. `before` guarda la fila entera borrada o los
  valores anteriores de un cambio; `after`, la fila entera creada o tal como quedó.

Los listeners se enganchan a la clase `Session`:
- `before_flush`: fila entera de lo que se va a borrar y, siguiendo las claves foráneas
  con ON DELETE CASCADE, la de los hijos que la base se llevará sola (partes, adjuntos,
  compras de fondos).
- `after_flush`: altas y cambios, con el valor anterior de cada campo.
- `do_orm_execute`: los `delete(...)` / `update(...)` masivos, que no pasan por el flush.
- `before_commit`: los resúmenes que `write_log` dejó pendientes en la petición.

Todo se escribe con un INSERT directo **en la misma transacción** que el cambio: si el
cambio no llega a guardarse, su entrada tampoco.

Quién: `current_active_user` pone `actor` (usuario y fuente `web` | `api`). Sin petición
la fuente es `auto` y el usuario sale de la columna `user_id` de la fila.

Deshacer (`undo`): lo creado se borra, lo borrado vuelve con su id y lo cambiado recupera
el valor anterior. Va **todo o nada**: lo que va en pareja (un movimiento y sus partes,
una liquidación de tarjeta y la marca de ciclo cobrado de la tarjeta, un ticket y los
movimientos que generó) forma un mismo bloque (`bundles`) y se deshace junto; si algo del
bloque no se puede deshacer, no se toca nada y se explica por qué.
"""
from __future__ import annotations

import contextvars
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import Date, DateTime, Time, Uuid, and_, delete, event, insert, select, update
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ClauseElement

from app.database import AsyncSessionLocal, Base
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

_AUDIT = AuditLog.__table__

# Tablas fuera del historial: el propio historial, usuarios y claves (secretos), ajustes de
# la instalación y preferencias de pantalla (cambian a cada rato y no son datos).
SKIP_TABLES = {"audit_logs", "users", "api_keys", "app_settings", "user_preferences"}
LABEL_COLUMNS = ("name", "store_name", "original_name", "entity_name", "pattern", "filename")
# Las filas guardan los datos para deshacer 90 días; el resumen se queda.
RETENTION_DAYS = 90
# Más filas que esto en una operación: solo se deshace entera (no fila a fila).
MAX_ROWS_PER_ROW_UNDO = 300

TABLE_ES = {
    "movements": "Movimiento", "accounts": "Cuenta", "movement_types": "Tipo",
    "income_expense_groups": "Grupo", "movement_splits": "Parte de movimiento",
    "movement_files": "Adjunto", "investment_funds": "Fondo",
    "investment_purchases": "Compra de fondo", "movement_templates": "Plantilla",
    "tickets": "Ticket", "real_accounts": "Cuenta real",
    "real_account_accounts": "Enlace de cuenta real", "item_category_rules": "Regla de ticket",
}


FIELD_ES = {
    "name": "nombre", "money": "importe", "date": "fecha", "bank_date": "fecha de banco",
    "notes": "notas", "movement_type_id": "tipo", "account_id": "cuenta",
    "from_account_id": "cuenta de origen", "paid": "pagado", "no_count": "no cuenta",
    "initial_balance": "saldo inicial", "credit_last_cycle_end": "último ciclo cobrado",
}


@dataclass
class Actor:
    user_id: uuid.UUID
    source: str                      # web | api
    pending: list[dict] = field(default_factory=list)


actor: contextvars.ContextVar[Actor | None] = contextvars.ContextVar("audit_actor", default=None)


def set_actor(user_id: uuid.UUID, source: str) -> None:
    current = actor.get()
    if current is not None and current.user_id == user_id:
        return
    actor.set(Actor(user_id, source))


# ── Serialización ─────────────────────────────────────────────────────────────

def _ser(v: Any) -> Any:
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if isinstance(v, (datetime, date, time)):
        return v.isoformat()
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (bytes, bytearray, memoryview)):
        return None
    if isinstance(v, ClauseElement):
        return None  # func.now() y compañía: lo pone la base
    if isinstance(v, dict):
        return {str(k): _ser(x) for k, x in v.items()}
    if isinstance(v, (list, tuple, set)):
        return [_ser(x) for x in v]
    return str(v)


def _dumps(d: dict | None) -> str | None:
    if d is None:
        return None
    return json.dumps(_ser(d), ensure_ascii=False)


def _loads(s: str | None) -> dict | None:
    if not s:
        return None
    try:
        v = json.loads(s)
    except ValueError:
        return None
    return v if isinstance(v, dict) else None


def _coerce(col, v: Any) -> Any:
    """Valor del JSON → tipo de la columna (fechas y UUID se guardaron como texto)."""
    if v is None or not isinstance(v, str):
        return v
    t = col.type
    if isinstance(t, DateTime):
        return datetime.fromisoformat(v)
    if isinstance(t, Date):
        return date.fromisoformat(v[:10])
    if isinstance(t, Time):
        return time.fromisoformat(v)
    if isinstance(t, Uuid):
        return uuid.UUID(v)
    return v


def _same(a: Any, b: Any) -> bool:
    a, b = _ser(a), _ser(b)
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        return abs(a - b) < 1e-9
    if isinstance(a, str) and isinstance(b, str) and len(a) >= 10 and len(b) >= 10:
        # Fechas: «2026-11-15» y «2026-11-15T00:00:00» son lo mismo según el motor
        return a == b or a.replace(" ", "T") == b.replace(" ", "T")
    return a == b


def _row_id(table, row: dict) -> str:
    pk = [c.name for c in table.primary_key.columns]
    if len(pk) == 1:
        v = row.get(pk[0])
        return "" if v is None else str(_ser(v))
    return json.dumps({k: _ser(row.get(k)) for k in pk}, sort_keys=True)


def _pk_value(col, v: Any) -> Any:
    try:
        if col.type.python_type is int and isinstance(v, str):
            return int(v)
    except NotImplementedError:
        pass
    return _coerce(col, v)


def _pk_filter(table, row_id: str):
    pk = list(table.primary_key.columns)
    if not pk or not row_id:
        return None
    if len(pk) == 1:
        return pk[0] == _pk_value(pk[0], row_id)
    vals = json.loads(row_id)
    return and_(*(c == _pk_value(c, vals.get(c.name)) for c in pk))


def _label(row: dict) -> str:
    for k in LABEL_COLUMNS:
        v = row.get(k)
        if isinstance(v, str) and v.strip():
            return " ".join(v.split())[:200]
    return ""


def _obj_row(obj, loaded_only: bool = False) -> tuple[Any, dict]:
    """(tabla, {columna: valor}) de un objeto del ORM."""
    st = sa_inspect(obj)
    mapper = st.mapper
    table = mapper.local_table
    row = {}
    for attr in mapper.column_attrs:
        col = attr.columns[0]
        if getattr(col, "table", None) is not table:
            continue
        if loaded_only:
            if attr.key in st.dict:
                row[col.name] = st.dict[attr.key]
        else:
            row[col.name] = getattr(obj, attr.key, None)
    return table, row


def _as_uuid(v: Any) -> uuid.UUID | None:
    if isinstance(v, uuid.UUID):
        return v
    if isinstance(v, str):
        try:
            return uuid.UUID(v)
        except ValueError:
            return None
    return None


# ── Acumular y escribir ───────────────────────────────────────────────────────

def _group(session) -> str:
    g = session.info.get("audit_group")
    if g is None:
        g = session.info["audit_group"] = str(uuid.uuid4())
    return g


def _entry(session, action: str, table, row: dict, *, before: dict | None = None,
           after: dict | None = None) -> dict:
    act = actor.get()
    uid = act.user_id if act else _as_uuid(row.get("user_id"))
    rid = _row_id(table, row)
    pk = list(table.primary_key.columns)
    entity_id = None
    if len(pk) == 1 and isinstance(row.get(pk[0].name), int):
        entity_id = row[pk[0].name]
    return {
        "user_id": uid,
        "created_at": datetime.utcnow(),
        "entity_type": table.name[:50],
        "entity_id": entity_id,
        "action": action,
        "summary": _label(row)[:500],
        "before": _dumps(before),
        "after": _dumps(after),
        "source": act.source if act else "auto",
        "group_id": _group(session),
        "table_name": table.name,
        "row_id": rid[:200],
        "restored_at": None,
    }


def _write(conn, entries: list[dict]) -> None:
    if not entries:
        return
    # Filas sin user_id (partes, adjuntos, enlaces): son del mismo usuario que el resto
    uid = next((e["user_id"] for e in entries if e["user_id"] is not None), None)
    for e in entries:
        if e["user_id"] is None:
            e["user_id"] = uid
    entries = [e for e in entries if e["user_id"] is not None]
    if entries:
        conn.execute(insert(_AUDIT), entries)


def _fk_enforced(conn) -> bool:
    """SQLite (el ejecutable standalone) no aplica ON DELETE CASCADE salvo con el PRAGMA."""
    if conn.dialect.name != "sqlite":
        return True
    try:
        return bool(conn.exec_driver_sql("PRAGMA foreign_keys").scalar())
    except SQLAlchemyError:
        return False


def _cascade(session, conn, table, rows: list[dict], out: dict, depth: int = 0) -> None:
    """Filas hijas que la base borrará en cascada al borrar `rows` de `table`."""
    if depth > 5 or not rows:
        return
    for child in Base.metadata.tables.values():
        if child.name in SKIP_TABLES:
            continue
        for fk in child.foreign_keys:
            if fk.column.table is not table or (fk.ondelete or "").upper() != "CASCADE":
                continue
            values = list({r[fk.column.name] for r in rows if r.get(fk.column.name) is not None})
            if not values:
                continue
            found = [dict(m) for m in conn.execute(select(child).where(fk.parent.in_(values))).mappings()]
            fresh = []
            for r in found:
                key = (child.name, _row_id(child, r))
                if key not in out:
                    out[key] = _entry(session, "delete", child, r, before=r)
                    fresh.append(r)
            _cascade(session, conn, child, fresh, out, depth + 1)


def _skip(session) -> bool:
    return bool(session.info.get("audit_skip"))


# ── Eventos de la sesión ──────────────────────────────────────────────────────

@event.listens_for(Session, "before_flush")
def _before_flush(session, flush_context, instances):
    if _skip(session):
        return
    deleted = list(session.deleted)
    if not deleted:
        return
    pending: dict = session.info.setdefault("audit_deletes", {})
    conn = session.connection()
    cascade = _fk_enforced(conn)
    for obj in deleted:
        try:
            table, row = _obj_row(obj)
        except Exception:
            continue
        if table.name in SKIP_TABLES:
            continue
        key = (table.name, _row_id(table, row))
        if key in pending:
            continue
        pending[key] = _entry(session, "delete", table, row, before=row)
        if cascade:
            try:
                _cascade(session, conn, table, [row], pending)
            except SQLAlchemyError:
                logger.exception("Historial: no se pudieron leer los hijos de %s", key)


@event.listens_for(Session, "after_flush")
def _after_flush(session, flush_context):
    if _skip(session):
        session.info.pop("audit_deletes", None)
        return
    out: dict = session.info.pop("audit_deletes", {})
    # Lo que el ORM añadió a los borrados durante el flush (cascadas de relaciones)
    for obj in session.deleted:
        try:
            table, row = _obj_row(obj, loaded_only=True)
        except Exception:
            continue
        if table.name not in SKIP_TABLES:
            out.setdefault((table.name, _row_id(table, row)), _entry(session, "delete", table, row, before=row))

    entries = list(out.values())
    for obj in session.new:
        try:
            table, row = _obj_row(obj, loaded_only=True)
        except Exception:
            continue
        if table.name not in SKIP_TABLES:
            entries.append(_entry(session, "insert", table, row, after=row))

    for obj in session.dirty:
        st = sa_inspect(obj)
        mapper = st.mapper
        table = mapper.local_table
        if table.name in SKIP_TABLES or st.deleted or st.was_deleted:
            continue
        before, unknown = {}, []
        for attr in mapper.column_attrs:
            col = attr.columns[0]
            if getattr(col, "table", None) is not table:
                continue
            hist = st.attrs[attr.key].history
            if not hist.added and not hist.deleted:
                continue
            new = hist.added[0] if hist.added else None
            if hist.deleted:
                old = hist.deleted[0]
                if _ser(old) == _ser(new):
                    continue
                before[col.name] = old
            else:
                unknown.append(col.name)   # no estaba cargado: no se sabe qué había
        if not before and not unknown:
            continue
        _t, row = _obj_row(obj, loaded_only=True)
        if unknown:
            before["_unknown"] = unknown
        entries.append(_entry(session, "update", table, row, before=before, after=row))

    if entries:
        try:
            _write(session.connection(), entries)
        except SQLAlchemyError:
            logger.exception("Historial: no se pudo escribir")
            raise


@event.listens_for(Session, "do_orm_execute")
def _bulk(state):
    """`delete(...)` y `update(...)` lanzados con `db.execute`: no pasan por el flush."""
    if not (state.is_delete or state.is_update):
        return None
    session = state.session
    if _skip(session):
        return None
    stmt = state.statement
    tname = getattr(getattr(stmt, "table", None), "name", None)
    table = Base.metadata.tables.get(tname or "")
    if table is None or table.name in SKIP_TABLES or isinstance(state.parameters, list):
        return None
    conn = session.connection()
    q = select(table)
    if stmt.whereclause is not None:
        q = q.where(stmt.whereclause)
    try:
        rows_before = [dict(m) for m in conn.execute(q, state.parameters or {}).mappings()]
    except SQLAlchemyError:
        logger.exception("Historial: no se pudo leer lo que va a cambiar en %s", table.name)
        return None
    if not rows_before:
        return None

    if state.is_delete:
        out: dict = {}
        for r in rows_before:
            out.setdefault((table.name, _row_id(table, r)), _entry(session, "delete", table, r, before=r))
        if _fk_enforced(conn):
            _cascade(session, conn, table, rows_before, out)
        _write(conn, list(out.values()))
        return None

    result = state.invoke_statement()
    pk = list(table.primary_key.columns)
    if len(pk) != 1:
        return result
    ids = [r[pk[0].name] for r in rows_before]
    after = {r[pk[0].name]: dict(r) for r in conn.execute(select(table).where(pk[0].in_(ids))).mappings()}
    entries = []
    for r in rows_before:
        a = after.get(r[pk[0].name])
        if a is None:
            continue
        before = {k: r[k] for k in r if _ser(r[k]) != _ser(a.get(k))}
        if before:
            entries.append(_entry(session, "update", table, a, before=before, after=a))
    _write(conn, entries)
    return result


@event.listens_for(Session, "before_commit")
def _flush_summaries(session):
    """Los resúmenes de `write_log` van en la misma transacción y operación que el cambio."""
    act = actor.get()
    if act is None or not act.pending or _skip(session):
        return
    entries, act.pending = act.pending, []
    gid = _group(session)
    for e in entries:
        e["group_id"] = gid
    try:
        session.connection().execute(insert(_AUDIT), entries)
    except SQLAlchemyError:
        logger.exception("Historial: no se pudo escribir el resumen")


@event.listens_for(Session, "after_commit")
@event.listens_for(Session, "after_rollback")
def _end_group(session):
    session.info.pop("audit_group", None)
    session.info.pop("audit_deletes", None)


async def write_log(
    user_id: uuid.UUID,
    entity_type: str,
    entity_id: int | None,
    action: str,
    summary: str,
    before: dict | None = None,
    after: dict | None = None,
    source: str = 'user',
) -> None:
    """Frase legible de lo que acaba de pasar. Nunca falla.

    Dentro de una petición queda pendiente y se escribe al hacer commit, en la misma
    operación que las filas que cambiaron (y si no hay commit, no se escribe: no pasó).
    Sin petición (inicio de sesión) se escribe ya, con su propia sesión.
    """
    row = {
        "user_id": user_id,
        "created_at": datetime.utcnow(),
        "entity_type": entity_type[:50],
        "entity_id": entity_id,
        "action": action[:20],
        "summary": summary[:500],
        "before": _dumps(before),
        "after": _dumps(after),
        "source": source,
        "group_id": None,
        "table_name": None,
        "row_id": None,
        "restored_at": None,
    }
    act = actor.get()
    if act is not None and act.user_id == user_id:
        if source == 'user':
            row["source"] = act.source
        act.pending.append(row)
        return
    try:
        async with AsyncSessionLocal() as db:
            row["group_id"] = str(uuid.uuid4())
            await db.execute(insert(_AUDIT), [row])
            await db.commit()
    except Exception as e:
        # ascii(): en una consola cp1252 (Windows) un «→» del resumen haría fallar el propio print
        print(f"[audit] write_log failed: {ascii(e)}", flush=True)


# ── Bloques: lo que se deshace junto ──────────────────────────────────────────

def _values(e: AuditLog) -> dict:
    """La fila tal como se conoce: la creada, la borrada o como quedó tras el cambio."""
    if e.action == "delete":
        return _loads(e.before) or {}
    return _loads(e.after) or {}


def bundles(entries: list[AuditLog]) -> dict[int, int]:
    """id de entrada → bloque. Dentro de una operación, dos filas van juntas si una apunta
    a la otra (clave foránea: un movimiento y sus partes, una compra y su movimiento, una
    liquidación de tarjeta y la tarjeta que marca el ciclo cobrado), si son la misma fila o
    si un ticket guarda el id del movimiento que generó."""
    rows = [e for e in entries if e.table_name]
    parent = {e.id: e.id for e in rows}

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    by_key: dict[tuple[str, str], list[int]] = {}
    for e in rows:
        by_key.setdefault((e.table_name, e.row_id or ""), []).append(e.id)
    for ids in by_key.values():
        for i in ids[1:]:
            union(ids[0], i)

    for e in rows:
        table = Base.metadata.tables.get(e.table_name)
        if table is None:
            continue
        vals = _values(e)
        # De un cambio cuentan el valor nuevo y el anterior de cada clave foránea
        olds = {k: v for k, v in (_loads(e.before) or {}).items() if k != "_unknown"} if e.action == "update" else {}
        for fk in table.foreign_keys:
            target = fk.column.table
            if target.name in SKIP_TABLES or len(target.primary_key.columns) != 1:
                continue
            for v in {str(x) for x in (vals.get(fk.parent.name), olds.get(fk.parent.name)) if x is not None}:
                for other in by_key.get((target.name, v), []):
                    union(e.id, other)
        if e.table_name == "tickets":
            gen = vals.get("generated_movements")
            try:
                linked = json.loads(gen) if isinstance(gen, str) else {}
            except ValueError:
                linked = {}
            for mv_id in (linked.values() if isinstance(linked, dict) else linked or []):
                for other in by_key.get(("movements", str(mv_id)), []):
                    union(e.id, other)
    return {e.id: find(e.id) for e in rows}


async def expand_selection(db: AsyncSession, user_id: uuid.UUID, *, group_id: str | None = None,
                           ids: list[int] | None = None) -> list[AuditLog]:
    """Filas a deshacer: la operación entera, o las pedidas más todo su bloque."""
    base = select(AuditLog).where(AuditLog.user_id == user_id, AuditLog.table_name.is_not(None))
    if group_id:
        return list((await db.execute(base.where(AuditLog.group_id == group_id).order_by(AuditLog.id))).scalars())
    picked = list((await db.execute(base.where(AuditLog.id.in_(ids or [])))).scalars())
    out: dict[int, AuditLog] = {}
    for gid in {e.group_id for e in picked if e.group_id}:
        group = list((await db.execute(base.where(AuditLog.group_id == gid).order_by(AuditLog.id))).scalars())
        b = bundles(group)
        wanted = {b[e.id] for e in picked if e.group_id == gid and e.id in b}
        for e in group:
            if b.get(e.id) in wanted:
                out[e.id] = e
    return sorted(out.values(), key=lambda e: e.id)


# ── Deshacer ──────────────────────────────────────────────────────────────────

class UndoError(Exception):
    def __init__(self, problems: list[str]):
        super().__init__("; ".join(problems))
        self.problems = problems


def _what(e: AuditLog) -> str:
    name = TABLE_ES.get(e.table_name or "", e.table_name or "Fila")
    return f"{name} «{e.summary}»" if e.summary else f"{name} {e.row_id}"


def _owned(table, row: dict, user_id: uuid.UUID) -> bool:
    if "user_id" not in table.c:
        return True
    v = row.get("user_id")
    return v is None or str(v) == str(user_id)


@dataclass
class _Step:
    kind: str                  # insert | update | delete
    table: Any
    where: Any
    values: dict
    entries: list[AuditLog]


async def undo(db: AsyncSession, user_id: uuid.UUID, entries: list[AuditLog]) -> dict:
    """Deshace las filas dadas, todo o nada. Lanza `UndoError` con los motivos si algo
    no se puede deshacer; en ese caso no se ha tocado nada."""
    pending = [e for e in entries if e.table_name and e.restored_at is None]
    if not pending:
        return {"undone": 0}
    problems: list[str] = []
    if any(e.source == "undo" for e in pending):
        raise UndoError(["Esto ya es un deshacer: no se puede deshacer otra vez"])
    if any(e.group_id is None for e in pending):
        raise UndoError(["Registrado antes de poder deshacer: no guardó la fila entera"])

    # Cambios posteriores (de otra operación) en las mismas filas: habría que deshacerlos antes
    sel_ids = {e.id for e in pending}
    keys: dict[tuple[str, str], list[AuditLog]] = {}
    for e in pending:
        keys.setdefault((e.table_name, e.row_id or ""), []).append(e)
    later = (await db.execute(
        select(AuditLog.table_name, AuditLog.row_id, AuditLog.id).where(
            AuditLog.user_id == user_id,
            AuditLog.table_name.in_(sorted({k[0] for k in keys})),
            AuditLog.id > min(sel_ids),
            AuditLog.restored_at.is_(None),
            AuditLog.source != "undo",
        )
    )).all()
    newest = {k: max(x.id for x in es) for k, es in keys.items()}
    blocked = {(t, r) for t, r, i in later if i not in sel_ids and (t, r) in newest and i > newest[(t, r)]}
    for k in blocked:
        problems.append(f"{_what(keys[k][0])}: cambió después. Deshaz antes los cambios más recientes")

    steps: list[_Step] = []
    for key, es in keys.items():
        if key in blocked:
            continue
        es.sort(key=lambda x: x.id)
        first, last = es[0], es[-1]
        table = Base.metadata.tables.get(key[0])
        where = _pk_filter(table, key[1]) if table is not None else None
        if where is None:
            problems.append(f"{_what(first)}: la tabla ya no existe")
            continue
        current = (await db.execute(select(table).where(where))).mappings().first()
        current = dict(current) if current is not None else None
        if current is not None and not _owned(table, current, user_id):
            problems.append(f"{_what(first)}: es de otro usuario")
            continue

        if first.action == "insert":
            if last.action == "delete" or current is None:
                steps.append(_Step("none", table, where, {}, es))   # ya no está
            else:
                steps.append(_Step("delete", table, where, {}, es))
            continue

        if first.action == "delete":
            if any(x.action == "insert" for x in es[1:]):
                problems.append(f"{_what(first)}: se borró y se volvió a crear en la misma operación")
                continue
            data = _loads(first.before) or {}
            if not _owned(table, data, user_id):
                problems.append(f"{_what(first)}: es de otro usuario")
                continue
            if current is None:
                steps.append(_Step("insert", table, where, data, es))
            elif all(_same(current.get(k), v) for k, v in data.items() if k in current):
                steps.append(_Step("none", table, where, {}, es))   # ya está como estaba
            else:
                problems.append(f"{_what(first)}: ya hay otra fila con su id")
            continue

        # Cambios: el valor más antiguo de cada campo es el que se recupera
        old: dict = {}
        unknown: set[str] = set()
        for x in es:
            if x.action != "update":
                continue
            b = _loads(x.before) or {}
            unknown |= set(b.pop("_unknown", []) or [])
            for k, v in b.items():
                old.setdefault(k, v)
        if unknown:
            problems.append(f"{_what(first)}: no se guardó el valor anterior de "
                            f"{', '.join(FIELD_ES.get(k, k) for k in sorted(unknown))}")
            continue
        if last.action == "delete":
            if current is not None:
                problems.append(f"{_what(first)}: ya hay otra fila con su id")
                continue
            steps.append(_Step("insert", table, where, {**(_loads(last.before) or {}), **old}, es))
            continue
        if current is None:
            problems.append(f"{_what(first)}: ya no existe")
            continue
        expect = _loads(last.after) or {}
        changed = [k for k in old if k in expect and k in current and not _same(current[k], expect[k])]
        if changed:
            fields = ", ".join(FIELD_ES.get(k, k) for k in changed)
            problems.append(f"{_what(first)}: {fields} cambió después por otro lado")
            continue
        steps.append(_Step("update", table, where, old, es))

    if problems:
        raise UndoError(problems)

    order = {t.name: i for i, t in enumerate(Base.metadata.sorted_tables)}
    inserts = sorted([s for s in steps if s.kind == "insert"], key=lambda s: order.get(s.table.name, 0))
    updates = [s for s in steps if s.kind == "update"]
    deletes = sorted([s for s in steps if s.kind == "delete"], key=lambda s: order.get(s.table.name, 0), reverse=True)

    now = datetime.utcnow()
    gid = str(uuid.uuid4())
    log: list[dict] = []

    def logrow(action: str, s: _Step, before: dict | None, after: dict | None) -> None:
        e = s.entries[0]
        log.append({
            "user_id": user_id, "created_at": now, "entity_type": (e.table_name or "")[:50],
            "entity_id": e.entity_id, "action": action, "summary": e.summary or "",
            "before": _dumps(before), "after": _dumps(after), "source": "undo", "group_id": gid,
            "table_name": e.table_name, "row_id": e.row_id, "restored_at": None,
        })

    db.info["audit_skip"] = True
    try:
        for s in inserts:
            values = {k: _coerce(s.table.c[k], v) for k, v in s.values.items() if k in s.table.c}
            await db.execute(insert(s.table).values(**values))
            logrow("insert", s, None, s.values)
        for s in updates:
            row = (await db.execute(select(s.table).where(s.where))).mappings().first()
            values = {k: _coerce(s.table.c[k], v) for k, v in s.values.items() if k in s.table.c}
            await db.execute(update(s.table).where(s.where).values(**values))
            logrow("update", s, {k: _ser(row[k]) for k in values} if row else None, s.values)
        for s in deletes:
            row = (await db.execute(select(s.table).where(s.where))).mappings().first()
            await db.execute(delete(s.table).where(s.where))
            logrow("delete", s, dict(row) if row else None, None)

        for e in pending:
            e.restored_at = now
        # Los resúmenes de una operación deshecha entera también quedan marcados
        for g in {e.group_id for e in pending}:
            left = (await db.execute(select(AuditLog.id).where(
                AuditLog.group_id == g, AuditLog.table_name.is_not(None),
                AuditLog.restored_at.is_(None), AuditLog.id.not_in(sorted(sel_ids)),
            ).limit(1))).first()
            if left is None:
                await db.execute(update(AuditLog).where(
                    AuditLog.group_id == g, AuditLog.table_name.is_(None)).values(restored_at=now))
        headline = await _headline(db, pending)
        log.insert(0, {
            "user_id": user_id, "created_at": now, "entity_type": "undo", "entity_id": None,
            "action": "undo", "summary": f"Deshecho: {headline}"[:500], "before": None, "after": None,
            "source": "undo", "group_id": gid, "table_name": None, "row_id": None, "restored_at": None,
        })
        await db.execute(insert(_AUDIT), log)
        await db.commit()
    except SQLAlchemyError as exc:
        await db.rollback()
        logger.warning("Historial: no se pudo deshacer", exc_info=True)
        msg = str(getattr(exc, "orig", exc)).splitlines()[0][:200]
        raise UndoError([f"La base no lo permite (puede que otros datos dependan de esto): {msg}"]) from exc
    finally:
        db.info.pop("audit_skip", None)
    return {"undone": sum(1 for s in steps if s.kind != "none"), "rows": len(pending)}


async def _headline(db: AsyncSession, pending: list[AuditLog]) -> str:
    groups = {e.group_id for e in pending}
    summaries = (await db.execute(select(AuditLog.summary).where(
        AuditLog.group_id.in_(groups), AuditLog.table_name.is_(None)).order_by(AuditLog.id))).scalars().all()
    if summaries:
        text = summaries[0]
        return text + (f" (y {len(summaries) - 1} más)" if len(summaries) > 1 else "")
    first = pending[0]
    return _what(first) + (f" y {len(pending) - 1} filas más" if len(pending) > 1 else "")


async def purge_old(db: AsyncSession) -> int:
    """Las filas (los datos para deshacer) se guardan 90 días; el resumen se queda."""
    cutoff = datetime.utcnow() - timedelta(days=RETENTION_DAYS)
    res = await db.execute(delete(AuditLog).where(
        AuditLog.created_at < cutoff, AuditLog.table_name.is_not(None)))
    await db.commit()
    return res.rowcount or 0
