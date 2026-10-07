"""Puesta al día del esquema SQLite del ejecutable standalone.

El standalone no usa Alembic: crea la base de datos con `create_all`, que crea las tablas que
faltan pero nunca añade columnas a una tabla existente. Una instalación que se actualiza desde
una versión anterior se quedaría sin las columnas nuevas y fallaría al leerlas.

`sync_schema` crea las tablas que faltan y añade con ALTER TABLE las columnas que el modelo
tiene y la tabla no. Es idempotente: en una base de datos al día no hace nada.
"""
import logging

from sqlalchemy import Column, inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.sql.elements import TextClause

from app.database import Base

log = logging.getLogger(__name__)


def _literal(value) -> str | None:
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        # Los booleanos con server_default="true"/"false" se guardan como 1/0 en SQLite
        low = value.strip().lower()
        if low in ("true", "false"):
            return "1" if low == "true" else "0"
        return "'" + value.replace("'", "''") + "'"
    return None


def _default_sql(col: Column) -> str | None:
    """DEFAULT para el ALTER: el server_default del modelo o, si no, su default escalar."""
    sd = col.server_default
    if sd is not None and hasattr(sd, "arg"):
        arg = sd.arg
        if isinstance(arg, TextClause):
            return _literal(arg.text) if arg.text.strip().lower() in ("true", "false") else arg.text
        return _literal(arg)
    if col.default is not None and getattr(col.default, "is_scalar", False):
        return _literal(col.default.arg)
    return None


def _add_column_sql(conn: Connection, table: str, col: Column) -> str:
    sql = f'ALTER TABLE "{table}" ADD COLUMN "{col.name}" {col.type.compile(dialect=conn.dialect)}'
    default = _default_sql(col)
    if default is not None:
        sql += f" DEFAULT {default}"
        # SQLite solo admite NOT NULL en ADD COLUMN si hay DEFAULT
        if not col.nullable:
            sql += " NOT NULL"
    return sql


def sync_schema(conn: Connection) -> list[str]:
    """Crea tablas y columnas que falten. Devuelve las columnas añadidas como 'tabla.columna'."""
    Base.metadata.create_all(conn)
    insp = inspect(conn)
    added: list[str] = []
    for table in Base.metadata.sorted_tables:
        existing = {c["name"] for c in insp.get_columns(table.name)}
        for col in table.columns:
            if col.name in existing:
                continue
            conn.execute(text(_add_column_sql(conn, table.name, col)))
            added.append(f"{table.name}.{col.name}")
    if added:
        log.info("Esquema actualizado, columnas añadidas: %s", ", ".join(added))
    return added
