import datetime
import decimal
import uuid
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select, delete as sa_delete, text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.config import settings
from app.database import get_db
from app.models.account import Account
from app.models.income_expense_group import IncomeExpenseGroup
from app.models.investment import InvestmentFund, InvestmentPurchase
from app.models.movement import Movement
from app.models.movement_file import MovementFile
from app.models.movement_type import MovementType
from app.models.template import MovementTemplate as TemplateModel
from app.models.user_preference import UserPreference
from app.auth.setup import current_active_user
from app.models.user import User

router = APIRouter(prefix="/backup", tags=["backup"])

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")


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
        elif isinstance(v, uuid.UUID):
            result[k] = str(v)
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
async def export_backup(db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    uid = user.id
    groups    = (await db.execute(select(IncomeExpenseGroup).where(IncomeExpenseGroup.user_id == uid).order_by(IncomeExpenseGroup.id))).scalars().all()
    accounts  = (await db.execute(select(Account).where(Account.user_id == uid).order_by(Account.id))).scalars().all()
    types     = (await db.execute(select(MovementType).where(MovementType.user_id == uid).order_by(MovementType.id))).scalars().all()
    movements = (await db.execute(select(Movement).where(Movement.user_id == uid).order_by(Movement.id))).scalars().all()
    tpls      = (await db.execute(select(TemplateModel).where(TemplateModel.user_id == uid).order_by(TemplateModel.id))).scalars().all()

    mv_ids = [m.id for m in movements]
    inv_funds = (await db.execute(select(InvestmentFund).where(InvestmentFund.user_id == uid).order_by(InvestmentFund.id))).scalars().all()
    inv_purchases = []
    if mv_ids:
        inv_purchases = (await db.execute(
            select(InvestmentPurchase).where(InvestmentPurchase.movement_id.in_(mv_ids)).order_by(InvestmentPurchase.id)
        )).scalars().all()
    prefs = (await db.execute(select(UserPreference).where(UserPreference.user_id == uid))).scalars().all()

    return {
        "version": "2",
        "created_at": datetime.datetime.now().isoformat(),
        "db": {
            "groups":               [_clean(g) for g in groups],
            "accounts":             [_clean(a) for a in accounts],
            "types":                [_clean(t) for t in types],
            "movements":            [_clean(m) for m in movements],
            "investment_funds":     [_clean(f) for f in inv_funds],
            "investment_purchases": [_clean(p) for p in inv_purchases],
            "templates":            [_clean(t) for t in tpls],
            "preferences":          {p.key: p.value for p in prefs},
        },
    }


class RestorePayload(BaseModel):
    version: str
    db: dict[str, Any]
    restore_groups: bool = False
    restore_accounts: bool = False
    restore_types: bool = False
    restore_movements: bool = False
    restore_investments: bool = False
    restore_templates: bool = False
    restore_preferences: bool = False


@router.post("/restore", status_code=204)
async def restore_backup(payload: RestorePayload, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    uid = user.id
    rg = payload.restore_groups
    ra = payload.restore_accounts
    rt = payload.restore_types
    rm = payload.restore_movements
    ri = payload.restore_investments
    rtp = payload.restore_templates

    # Delete user's data in FK order
    if ri or rm or rt or ra or rg:
        mv_ids_res = await db.execute(select(Movement.id).where(Movement.user_id == uid))
        mv_ids = [r[0] for r in mv_ids_res.all()]
        if mv_ids:
            await db.execute(sa_delete(InvestmentPurchase).where(InvestmentPurchase.movement_id.in_(mv_ids)))
    if ri:
        await db.execute(sa_delete(InvestmentFund).where(InvestmentFund.user_id == uid))
    if rm or rt or ra or rg:
        mv_ids_res2 = await db.execute(select(Movement.id).where(Movement.user_id == uid))
        mv_ids2 = [r[0] for r in mv_ids_res2.all()]
        if mv_ids2:
            await db.execute(sa_delete(MovementFile).where(MovementFile.movement_id.in_(mv_ids2)))
        await db.execute(sa_delete(Movement).where(Movement.user_id == uid))
    if rt or ra or rg:
        await db.execute(sa_delete(MovementType).where(MovementType.user_id == uid))
    if ra or rg:
        await db.execute(sa_delete(Account).where(Account.user_id == uid))
    if rg:
        await db.execute(sa_delete(IncomeExpenseGroup).where(IncomeExpenseGroup.user_id == uid))
    await db.flush()

    if rg:
        for g in payload.db.get("groups", []):
            db.add(IncomeExpenseGroup(**{k: v for k, v in g.items() if k != "user_id"}, user_id=uid))
        await db.flush()

    if ra:
        for a in payload.db.get("accounts", []):
            db.add(Account(**{k: v for k, v in a.items() if k != "user_id"}, user_id=uid))
        await db.flush()

    if rt:
        for t in payload.db.get("types", []):
            db.add(MovementType(**{k: v for k, v in t.items() if k != "user_id"}, user_id=uid))
        await db.flush()

    if rm:
        for m in payload.db.get("movements", []):
            m = {k: v for k, v in m.items() if k != "user_id"}
            m["date"]      = _parse_date(m.get("date"))
            m["bank_date"] = _parse_date(m.get("bank_date"))
            db.add(Movement(**m, user_id=uid))
        await db.flush()

    if ri:
        for f in payload.db.get("investment_funds", []):
            db.add(InvestmentFund(**{k: v for k, v in f.items() if k != "user_id"}, user_id=uid))
        await db.flush()
        for p in payload.db.get("investment_purchases", []):
            db.add(InvestmentPurchase(**p))
        await db.flush()

    if rtp:
        await db.execute(sa_delete(TemplateModel).where(TemplateModel.user_id == uid))
        await db.flush()
        for t in payload.db.get("templates", []):
            db.add(TemplateModel(**{k: v for k, v in t.items() if k != "user_id"}, user_id=uid))
        await db.flush()

    if payload.restore_preferences:
        await db.execute(sa_delete(UserPreference).where(UserPreference.user_id == uid))
        await db.flush()
        for key, value in (payload.db.get("preferences") or {}).items():
            db.add(UserPreference(user_id=uid, key=key, value=value))
        await db.flush()

    if not _is_sqlite:
        await _fix_sequences(db)
    await db.commit()


async def _seed_defaults(db: AsyncSession, user_id: uuid.UUID) -> None:
    groups_data = [
        {"name": "Ingreso",       "color": "#22c55e"},
        {"name": "Ahorro",        "color": "#d97706"},
        {"name": "Vivienda",      "color": "#f97316"},
        {"name": "Alimentación",  "color": "#eab308"},
        {"name": "Transporte",    "color": "#8b5cf6"},
        {"name": "Ocio",          "color": "#ec4899"},
        {"name": "Salud",         "color": "#10b981"},
        {"name": "Otros",         "color": "#6b7280"},
    ]
    groups = {}
    for g in groups_data:
        obj = IncomeExpenseGroup(name=g["name"], color=g["color"], user_id=user_id)
        db.add(obj)
        groups[g["name"]] = obj
    await db.flush()

    main_acc    = Account(name="Cuenta principal", color="#3b82f6", icon="wallet",     initial_balance=0, sort_order=0, is_main=True,  user_id=user_id)
    savings_acc = Account(name="Ahorro",           color="#22c55e", icon="piggy-bank", initial_balance=0, sort_order=1, is_main=False, user_id=user_id)
    db.add(main_acc)
    db.add(savings_acc)
    await db.flush()

    types_data = [
        ("Nómina",              "Ingreso",     "Ingreso",      None),
        ("Freelance",           "Ingreso",     "Ingreso",      None),
        ("Otros ingresos",      "Ingreso",     "Ingreso",      None),
        ("Ahorro",              "Ahorro",      "Ahorro",       savings_acc),
        ("Alquiler / Hipoteca", "Vivienda",    "Gasto Casa",   None),
        ("Suministros",         "Vivienda",    "Gasto Casa",   None),
        ("Internet",            "Vivienda",    "Suscripciones", None),
        ("Supermercado",        "Alimentación","Vida Diaria",  None),
        ("Restaurantes",        "Alimentación","Vida Diaria",  None),
        ("Gasolina",            "Transporte",  "Transporte",   None),
        ("Transporte público",  "Transporte",  "Transporte",   None),
        ("Entretenimiento",     "Ocio",        "Entretenimiento", None),
        ("Viajes",              "Ocio",        "Vacaciones",   None),
        ("Suscripciones",       "Ocio",        "Suscripciones", None),
        ("Farmacia",            "Salud",       "Salud",        None),
        ("Médico",              "Salud",       "Salud",        None),
        ("Otros gastos",        "Otros",       "Vida Diaria",  None),
    ]
    for name, group_name, category, linked_acc in types_data:
        db.add(MovementType(
            name=name,
            category=category,
            income_expense_group_id=groups[group_name].id,
            linked_account_id=linked_acc.id if linked_acc else None,
            user_id=user_id,
        ))
    await db.flush()


@router.post("/reset", status_code=204)
async def reset_system(db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    uid = user.id
    mv_ids_res = await db.execute(select(Movement.id).where(Movement.user_id == uid))
    mv_ids = [r[0] for r in mv_ids_res.all()]
    if mv_ids:
        await db.execute(sa_delete(InvestmentPurchase).where(InvestmentPurchase.movement_id.in_(mv_ids)))
        await db.execute(sa_delete(MovementFile).where(MovementFile.movement_id.in_(mv_ids)))
    await db.execute(sa_delete(InvestmentFund).where(InvestmentFund.user_id == uid))
    await db.execute(sa_delete(Movement).where(Movement.user_id == uid))
    await db.execute(sa_delete(MovementType).where(MovementType.user_id == uid))
    await db.execute(sa_delete(Account).where(Account.user_id == uid))
    await db.execute(sa_delete(IncomeExpenseGroup).where(IncomeExpenseGroup.user_id == uid))
    await db.execute(sa_delete(TemplateModel).where(TemplateModel.user_id == uid))
    await db.flush()
    if not _is_sqlite:
        await _fix_sequences(db)
    await _seed_defaults(db, uid)
    if not _is_sqlite:
        await _fix_sequences(db)
    await db.commit()
