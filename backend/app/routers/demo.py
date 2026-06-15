"""Demo user endpoint — creates demo@caulky.app with 3.5 years of realistic data."""
import datetime
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.account import Account
from app.models.income_expense_group import IncomeExpenseGroup
from app.models.movement import Movement
from app.models.movement_type import MovementType
from app.models.user import User
from app.auth.manager import get_user_manager, UserManager
from app.auth.schemas import UserCreate
from fastapi_users.exceptions import UserAlreadyExists

router = APIRouter(prefix="/demo", tags=["demo"])

DEMO_EMAIL = "demo@caulky.app"
DEMO_PASSWORD = "demo123456"


def _rng(seed: int, lo: float, hi: float) -> float:
    """Deterministic pseudo-random float in [lo, hi)."""
    x = (seed * 1664525 + 1013904223) & 0xFFFFFFFF
    return lo + (x / 0xFFFFFFFF) * (hi - lo)


def _rng_int(seed: int, lo: int, hi: int) -> int:
    return int(_rng(seed, lo, hi + 1))


async def _seed_demo(db: AsyncSession, user_id: uuid.UUID) -> None:
    groups_data = [
        ("Ingreso",       "#22c55e"),
        ("Ahorro",        "#d97706"),
        ("Ahorro capricho", "#7c3aed"),
        ("Vivienda",      "#f97316"),
        ("Alimentación",  "#eab308"),
        ("Transporte",    "#8b5cf6"),
        ("Ocio",          "#ec4899"),
        ("Salud",         "#10b981"),
        ("Suscripciones", "#6366f1"),
        ("Otros",         "#6b7280"),
    ]
    groups: dict[str, IncomeExpenseGroup] = {}
    for name, color in groups_data:
        g = IncomeExpenseGroup(name=name, color=color, user_id=user_id)
        db.add(g)
        groups[name] = g
    await db.flush()

    main_acc    = Account(name="Cuenta principal", color="#3b82f6", icon="wallet",     initial_balance=1200, sort_order=0, is_main=True,  user_id=user_id, category="corriente")
    ahorro_acc  = Account(name="Ahorro",           color="#22c55e", icon="piggy-bank", initial_balance=800,  sort_order=1, is_main=False, user_id=user_id, category="ahorro")
    capricho_acc = Account(name="Ahorro capricho", color="#8b5cf6", icon="star",       initial_balance=200,  sort_order=2, is_main=False, user_id=user_id, category="ahorro")
    db.add(main_acc)
    db.add(ahorro_acc)
    db.add(capricho_acc)
    await db.flush()

    types_data = [
        ("Nómina",              "Ingreso",       None),
        ("Freelance",           "Ingreso",       None),
        ("Ahorro",              "Ahorro",        ahorro_acc),
        ("Ahorro capricho",     "Ahorro capricho", capricho_acc),
        ("Alquiler",            "Vivienda",      None),
        ("Suministros",         "Vivienda",      None),
        ("Supermercado",        "Alimentación",  None),
        ("Restaurantes",        "Alimentación",  None),
        ("Gasolina",            "Transporte",    None),
        ("Transporte público",  "Transporte",    None),
        ("Entretenimiento",     "Ocio",          None),
        ("Viajes",              "Ocio",          None),
        ("Netflix",             "Suscripciones", None),
        ("Spotify",             "Suscripciones", None),
        ("Farmacia",            "Salud",         None),
        ("Médico",              "Salud",         None),
        ("Otros gastos",        "Otros",         None),
    ]
    type_objs: dict[str, MovementType] = {}
    for name, group_name, linked_acc in types_data:
        mt = MovementType(
            name=name,
            category=group_name,
            income_expense_group_id=groups[group_name].id,
            linked_account_id=linked_acc.id if linked_acc else None,
            user_id=user_id,
        )
        db.add(mt)
        type_objs[name] = mt
    await db.flush()

    movements: list[Movement] = []

    # Generate data Jan 2023 → May 2026
    start = datetime.date(2023, 1, 1)
    end   = datetime.date(2026, 6, 1)
    cur   = start
    while cur < end:
        y, m = cur.year, cur.month
        seed_base = y * 100 + m

        # --- Nómina (day 1-3) ---
        nomina = round(_rng(seed_base + 1, 1820, 2180), 2)
        movements.append(Movement(
            name="Nómina",
            money=nomina,
            date=datetime.date(y, m, _rng_int(seed_base + 2, 1, 3)),
            movement_type_id=type_objs["Nómina"].id,
            paid=True,
            user_id=user_id,
        ))

        # Freelance (25% de los meses)
        if _rng(seed_base + 3, 0, 1) < 0.25:
            movements.append(Movement(
                name="Proyecto freelance",
                money=round(_rng(seed_base + 4, 200, 650), 2),
                date=datetime.date(y, m, _rng_int(seed_base + 5, 5, 20)),
                movement_type_id=type_objs["Freelance"].id,
                paid=True,
                user_id=user_id,
            ))

        # --- Alquiler (día 5) ---
        movements.append(Movement(
            name="Alquiler",
            money=750,
            date=datetime.date(y, m, 5),
            movement_type_id=type_objs["Alquiler"].id,
            paid=True,
            user_id=user_id,
        ))

        # --- Suministros (día 8-10) ---
        winter = m in (12, 1, 2)
        summer = m in (6, 7, 8)
        sumi = round(_rng(seed_base + 6, 110 if winter else 75, 160 if winter else 110 if summer else 130), 2)
        movements.append(Movement(
            name="Suministros",
            money=sumi,
            date=datetime.date(y, m, _rng_int(seed_base + 7, 8, 10)),
            movement_type_id=type_objs["Suministros"].id,
            paid=True,
            user_id=user_id,
        ))

        # --- Suscripciones ---
        movements.append(Movement(
            name="Netflix",
            money=17.99,
            date=datetime.date(y, m, 10),
            movement_type_id=type_objs["Netflix"].id,
            paid=True,
            user_id=user_id,
        ))
        movements.append(Movement(
            name="Spotify",
            money=10.99,
            date=datetime.date(y, m, 10),
            movement_type_id=type_objs["Spotify"].id,
            paid=True,
            user_id=user_id,
        ))

        # --- Ahorro (85% de los meses) ---
        if _rng(seed_base + 8, 0, 1) < 0.85:
            ahorro_amt = round(_rng(seed_base + 9, 120, 280), 2)
            movements.append(Movement(
                name="Ahorro mensual",
                money=ahorro_amt,
                date=datetime.date(y, m, _rng_int(seed_base + 10, 10, 15)),
                movement_type_id=type_objs["Ahorro"].id,
                paid=True,
                user_id=user_id,
            ))

        # --- Ahorro capricho (40% de los meses) ---
        if _rng(seed_base + 11, 0, 1) < 0.40:
            cap_amt = round(_rng(seed_base + 12, 30, 100), 2)
            movements.append(Movement(
                name="Ahorro capricho",
                money=cap_amt,
                date=datetime.date(y, m, _rng_int(seed_base + 13, 12, 20)),
                movement_type_id=type_objs["Ahorro capricho"].id,
                paid=True,
                user_id=user_id,
            ))

        # --- Supermercado (3-4 veces al mes) ---
        super_count = _rng_int(seed_base + 14, 3, 4)
        days_used: set[int] = set()
        for i in range(super_count):
            d = _rng_int(seed_base + 15 + i, 1, 28)
            while d in days_used:
                d = (d % 28) + 1
            days_used.add(d)
            movements.append(Movement(
                name="Supermercado",
                money=round(_rng(seed_base + 20 + i, 45, 115), 2),
                date=datetime.date(y, m, d),
                movement_type_id=type_objs["Supermercado"].id,
                paid=True,
                user_id=user_id,
            ))

        # --- Restaurantes (1-3 veces, 75% de los meses) ---
        if _rng(seed_base + 25, 0, 1) < 0.75:
            rest_count = _rng_int(seed_base + 26, 1, 3)
            for i in range(rest_count):
                d = _rng_int(seed_base + 27 + i, 1, 28)
                movements.append(Movement(
                    name="Restaurante" if i == 0 else f"Restaurante {i+1}",
                    money=round(_rng(seed_base + 30 + i, 20, 68), 2),
                    date=datetime.date(y, m, d),
                    movement_type_id=type_objs["Restaurantes"].id,
                    paid=True,
                    user_id=user_id,
                ))

        # --- Gasolina ---
        movements.append(Movement(
            name="Gasolina",
            money=round(_rng(seed_base + 35, 42, 68), 2),
            date=datetime.date(y, m, _rng_int(seed_base + 36, 12, 25)),
            movement_type_id=type_objs["Gasolina"].id,
            paid=True,
            user_id=user_id,
        ))

        # --- Entretenimiento (60% de los meses) ---
        if _rng(seed_base + 37, 0, 1) < 0.60:
            movements.append(Movement(
                name="Entradas / ocio",
                money=round(_rng(seed_base + 38, 15, 55), 2),
                date=datetime.date(y, m, _rng_int(seed_base + 39, 1, 28)),
                movement_type_id=type_objs["Entretenimiento"].id,
                paid=True,
                user_id=user_id,
            ))

        # --- Viajes (verano jul-ago, Navidad dic, Semana Santa abr) ---
        if m in (7, 8):
            viaje_amt = round(_rng(seed_base + 40, 380, 820), 2)
            movements.append(Movement(
                name="Vacaciones verano",
                money=viaje_amt,
                date=datetime.date(y, m, _rng_int(seed_base + 41, 1, 20)),
                movement_type_id=type_objs["Viajes"].id,
                paid=True,
                user_id=user_id,
            ))
        elif m == 12:
            movements.append(Movement(
                name="Viaje Navidad",
                money=round(_rng(seed_base + 42, 180, 350), 2),
                date=datetime.date(y, m, _rng_int(seed_base + 43, 20, 28)),
                movement_type_id=type_objs["Viajes"].id,
                paid=True,
                user_id=user_id,
            ))
        elif m == 4 and _rng(seed_base + 44, 0, 1) < 0.6:
            movements.append(Movement(
                name="Semana Santa",
                money=round(_rng(seed_base + 45, 150, 300), 2),
                date=datetime.date(y, m, _rng_int(seed_base + 46, 10, 20)),
                movement_type_id=type_objs["Viajes"].id,
                paid=True,
                user_id=user_id,
            ))

        # --- Farmacia (35% de los meses) ---
        if _rng(seed_base + 47, 0, 1) < 0.35:
            movements.append(Movement(
                name="Farmacia",
                money=round(_rng(seed_base + 48, 8, 38), 2),
                date=datetime.date(y, m, _rng_int(seed_base + 49, 1, 28)),
                movement_type_id=type_objs["Farmacia"].id,
                paid=True,
                user_id=user_id,
            ))

        # --- Médico (10% de los meses) ---
        if _rng(seed_base + 50, 0, 1) < 0.10:
            movements.append(Movement(
                name="Médico",
                money=round(_rng(seed_base + 51, 50, 130), 2),
                date=datetime.date(y, m, _rng_int(seed_base + 52, 1, 25)),
                movement_type_id=type_objs["Médico"].id,
                paid=True,
                user_id=user_id,
            ))

        # --- Otros (50% de los meses) ---
        if _rng(seed_base + 53, 0, 1) < 0.50:
            movements.append(Movement(
                name="Otros gastos",
                money=round(_rng(seed_base + 54, 5, 45), 2),
                date=datetime.date(y, m, _rng_int(seed_base + 55, 1, 28)),
                movement_type_id=type_objs["Otros gastos"].id,
                paid=True,
                user_id=user_id,
            ))

        # Advance to next month
        if m == 12:
            cur = datetime.date(y + 1, 1, 1)
        else:
            cur = datetime.date(y, m + 1, 1)

    for mv in movements:
        db.add(mv)
    await db.flush()


@router.post("/setup")
async def setup_demo(
    db: AsyncSession = Depends(get_db),
    user_manager: UserManager = Depends(get_user_manager),
):
    """Ensure the demo user exists with seeded data. Returns demo credentials."""
    try:
        user = await user_manager.create(
            UserCreate(email=DEMO_EMAIL, password=DEMO_PASSWORD),
        )
        await _seed_demo(db, user.id)
        await db.commit()
    except UserAlreadyExists:
        # User exists — check if it has any data
        user = await user_manager.get_by_email(DEMO_EMAIL)
        if user is None:
            raise HTTPException(status_code=500, detail="Demo user inconsistency")
        has_data = (await db.execute(
            select(Account.id).where(Account.user_id == user.id).limit(1)
        )).first()
        if not has_data:
            await _seed_demo(db, user.id)
            await db.commit()

    return {"email": DEMO_EMAIL, "password": DEMO_PASSWORD}
