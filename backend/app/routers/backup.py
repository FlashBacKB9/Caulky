import datetime
import decimal
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select, delete as sa_delete, text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.models.account import Account
from app.models.income_expense_group import IncomeExpenseGroup
from app.models.investment import InvestmentFund, InvestmentPurchase
from app.models.movement import Movement
from app.models.movement_file import MovementFile
from app.models.movement_type import MovementType

router = APIRouter(prefix="/backup", tags=["backup"])


def _clean(obj) -> dict[str, Any]:
    result = {}
    for k, v in obj.__dict__.items():
        if k.startswith("_"):
            continue
        if isinstance(v, datetime.datetime):
            result[k] = v.isoformat()
        elif isinstance(v, datetime.date):
            result[k] = v.isoformat()
        elif isinstance(v, decimal.Decimal):
            result[k] = float(v)
        else:
            result[k] = v
    return result


def _parse_date(v) -> datetime.date | None:
    if v is None:
        return None
    if isinstance(v, datetime.date):
        return v
    return datetime.date.fromisoformat(v)


async def _fix_sequences(db: AsyncSession) -> None:
    for table, col in [
        ("income_expense_groups", "id"),
        ("accounts", "id"),
        ("movement_types", "id"),
        ("movements", "id"),
        ("investment_funds", "id"),
        ("investment_purchases", "id"),
    ]:
        await db.execute(text(
            f"SELECT setval(pg_get_serial_sequence('{table}', '{col}'), "
            f"GREATEST(1, COALESCE((SELECT MAX({col}) FROM {table}), 1)))"
        ))


@router.get("/export")
async def export_backup(db: AsyncSession = Depends(get_db)):
    groups    = (await db.execute(select(IncomeExpenseGroup).order_by(IncomeExpenseGroup.id))).scalars().all()
    accounts  = (await db.execute(select(Account).order_by(Account.id))).scalars().all()
    types     = (await db.execute(select(MovementType).order_by(MovementType.id))).scalars().all()
    movements = (await db.execute(select(Movement).order_by(Movement.id))).scalars().all()
    inv_funds = (await db.execute(select(InvestmentFund).order_by(InvestmentFund.id))).scalars().all()
    inv_purchases = (await db.execute(select(InvestmentPurchase).order_by(InvestmentPurchase.id))).scalars().all()

    return {
        "version": "2",
        "created_at": datetime.datetime.now().isoformat(),
        "db": {
            "groups":             [_clean(g) for g in groups],
            "accounts":           [_clean(a) for a in accounts],
            "types":              [_clean(t) for t in types],
            "movements":          [_clean(m) for m in movements],
            "investment_funds":   [_clean(f) for f in inv_funds],
            "investment_purchases": [_clean(p) for p in inv_purchases],
        },
    }


class RestorePayload(BaseModel):
    version: str
    db: dict[str, list[dict[str, Any]]]
    restore_groups: bool = False
    restore_accounts: bool = False
    restore_types: bool = False
    restore_movements: bool = False
    restore_investments: bool = False


@router.post("/restore", status_code=204)
async def restore_backup(payload: RestorePayload, db: AsyncSession = Depends(get_db)):
    rg = payload.restore_groups
    ra = payload.restore_accounts
    rt = payload.restore_types
    rm = payload.restore_movements
    ri = payload.restore_investments

    # Delete in safe FK order — most-dependent tables first.
    # investment_purchases FK → movements (CASCADE), so delete before movements.
    # investment_funds FK → movement_types (SET NULL), independent.
    del_inv_purchases = ri or rm or rt or ra or rg  # purchases gone whenever movements are wiped
    del_inv_funds     = ri
    del_movements     = rm or rt or ra or rg
    del_types         = rt or ra or rg
    del_accounts      = ra or rg
    del_groups        = rg

    if del_inv_purchases:
        await db.execute(sa_delete(InvestmentPurchase))
    if del_inv_funds:
        await db.execute(sa_delete(InvestmentFund))
    if del_movements:
        await db.execute(sa_delete(MovementFile))
        await db.execute(sa_delete(Movement))
    if del_types:
        await db.execute(sa_delete(MovementType))
    if del_accounts:
        await db.execute(sa_delete(Account))
    if del_groups:
        await db.execute(sa_delete(IncomeExpenseGroup))
    await db.flush()

    # Insert in FK order
    if rg:
        for g in payload.db.get("groups", []):
            db.add(IncomeExpenseGroup(**g))
        await db.flush()

    if ra:
        for a in payload.db.get("accounts", []):
            db.add(Account(**a))
        await db.flush()

    if rt:
        for t in payload.db.get("types", []):
            db.add(MovementType(**t))
        await db.flush()

    if rm:
        for m in payload.db.get("movements", []):
            m = dict(m)
            m["date"]      = _parse_date(m.get("date"))
            m["bank_date"] = _parse_date(m.get("bank_date"))
            db.add(Movement(**m))
        await db.flush()

    if ri:
        for f in payload.db.get("investment_funds", []):
            db.add(InvestmentFund(**f))
        await db.flush()
        for p in payload.db.get("investment_purchases", []):
            db.add(InvestmentPurchase(**p))
        await db.flush()

    await _fix_sequences(db)
    await db.commit()


async def _seed_defaults(db: AsyncSession) -> None:
    """Insert sensible default groups, accounts and movement types."""

    # ── Groups ────────────────────────────────────────────────────────────────
    groups_data = [
        {"name": "Ingreso",       "color": "#22c55e"},
        {"name": "Ahorro",        "color": "#3b82f6"},
        {"name": "Vivienda",      "color": "#f97316"},
        {"name": "Alimentación",  "color": "#eab308"},
        {"name": "Transporte",    "color": "#8b5cf6"},
        {"name": "Ocio",          "color": "#ec4899"},
        {"name": "Salud",         "color": "#10b981"},
        {"name": "Otros",         "color": "#6b7280"},
    ]
    groups = {}
    for g in groups_data:
        obj = IncomeExpenseGroup(name=g["name"], color=g["color"])
        db.add(obj)
        groups[g["name"]] = obj
    await db.flush()

    # ── Accounts ──────────────────────────────────────────────────────────────
    main_acc    = Account(name="Cuenta principal", color="#3b82f6", icon="wallet",     initial_balance=0, sort_order=0, is_main=True)
    savings_acc = Account(name="Ahorro",           color="#22c55e", icon="piggy-bank", initial_balance=0, sort_order=1, is_main=False)
    db.add(main_acc)
    db.add(savings_acc)
    await db.flush()

    # ── Movement types ────────────────────────────────────────────────────────
    types_data = [
        # Ingresos
        ("Nómina",              "Ingreso",     "Ingreso",     None),
        ("Freelance",           "Ingreso",     "Ingreso",     None),
        ("Otros ingresos",      "Ingreso",     "Ingreso",     None),
        # Ahorro
        ("Ahorro",              "Ahorro",      "Ahorro",      savings_acc),
        # Vivienda
        ("Alquiler / Hipoteca", "Vivienda",    "Gasto Casa",  None),
        ("Suministros",         "Vivienda",    "Gasto Casa",  None),
        ("Internet",            "Vivienda",    "Suscripciones", None),
        # Alimentación
        ("Supermercado",        "Alimentación","Vida Diaria", None),
        ("Restaurantes",        "Alimentación","Vida Diaria", None),
        # Transporte
        ("Gasolina",            "Transporte",  "Transporte",  None),
        ("Transporte público",  "Transporte",  "Transporte",  None),
        # Ocio
        ("Entretenimiento",     "Ocio",        "Entretenimiento", None),
        ("Viajes",              "Ocio",        "Vacaciones",  None),
        ("Suscripciones",       "Ocio",        "Suscripciones", None),
        # Salud
        ("Farmacia",            "Salud",       "Salud",       None),
        ("Médico",              "Salud",       "Salud",       None),
        # Otros
        ("Otros gastos",        "Otros",       "Vida Diaria", None),
    ]
    for name, group_name, category, linked_acc in types_data:
        db.add(MovementType(
            name=name,
            category=category,
            income_expense_group_id=groups[group_name].id,
            linked_account_id=linked_acc.id if linked_acc else None,
        ))
    await db.flush()


@router.post("/reset", status_code=204)
async def reset_system(db: AsyncSession = Depends(get_db)):
    """Delete all user data, reset sequences and seed defaults."""
    await db.execute(sa_delete(InvestmentPurchase))
    await db.execute(sa_delete(InvestmentFund))
    await db.execute(sa_delete(MovementFile))
    await db.execute(sa_delete(Movement))
    await db.execute(sa_delete(MovementType))
    await db.execute(sa_delete(Account))
    await db.execute(sa_delete(IncomeExpenseGroup))
    await db.flush()
    await _fix_sequences(db)
    await _seed_defaults(db)
    await _fix_sequences(db)
    await db.commit()
