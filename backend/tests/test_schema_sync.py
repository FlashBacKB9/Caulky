import sqlite3
from datetime import date

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

import app.main  # noqa: F401 – registra todos los modelos
from app.models.account import Account
from app.services.schema_sync import sync_schema


def _old_db(path):
    # Esquema de una instalación anterior: cuentas sin columnas de intereses ni de tarjeta
    con = sqlite3.connect(path)
    con.execute("""CREATE TABLE accounts (
        id INTEGER PRIMARY KEY, name VARCHAR(100) NOT NULL, description TEXT,
        color VARCHAR(20) NOT NULL, icon VARCHAR(50) NOT NULL, initial_balance NUMERIC(12,2) NOT NULL,
        sort_order INTEGER NOT NULL, is_main BOOLEAN NOT NULL, category VARCHAR(20) NOT NULL,
        depreciation_rate NUMERIC(6,4), value_date DATE, new_car BOOLEAN NOT NULL, user_id CHAR(32))""")
    con.execute("""INSERT INTO accounts (name, color, icon, initial_balance, sort_order, is_main, category, new_car)
                   VALUES ('Principal', '#000', 'wallet', 100, 0, 1, 'corriente', 0)""")
    con.commit()
    con.close()


def test_adds_missing_columns_and_tables(tmp_path):
    path = tmp_path / "old.db"
    _old_db(path)
    engine = create_engine(f"sqlite:///{path}")
    with engine.begin() as conn:
        added = sync_schema(conn)
    assert "accounts.credit_auto_charge" in added
    assert "accounts.interest_enabled" in added
    assert "movements.credit_cycle_end" not in added  # la tabla no existía: la crea create_all

    with Session(engine) as s:
        acc = s.execute(select(Account)).scalar_one()
        assert acc.name == "Principal"
        assert acc.credit_auto_charge is True
        assert acc.interest_enabled is False
        assert acc.credit_limit is None
        acc.credit_last_cycle_end = date(2026, 9, 30)
        s.commit()

    # Idempotente: una segunda pasada no toca nada
    with engine.begin() as conn:
        assert sync_schema(conn) == []
        assert conn.execute(text("SELECT count(*) FROM movements")).scalar() == 0
