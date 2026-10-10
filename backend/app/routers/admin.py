"""Administración: ajustes de la instalación y reparto de datos sin dueño tras el primer login."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import update as sa_update, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.account import Account
from app.models.income_expense_group import IncomeExpenseGroup
from app.models.investment import InvestmentFund
from app.models.movement import Movement
from app.models.movement_type import MovementType
from app.auth.setup import current_active_user
from app.models.user import User
from app.routers.backup import _seed_defaults
from app.services.admin import (
    AI_TERMINAL_ENABLED, REGISTRATION_OPEN, current_admin, current_session_admin,
    get_flag, registration_open, set_flag,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/claim")
async def claim_unclaimed_data(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    """Assign all rows with user_id=NULL to the current user.
    If no pre-existing data exists, seed defaults for a new user.

    Solo el administrador se queda los datos sin dueño (de antes de haber usuarios); a
    cualquier otro solo se le crean los datos iniciales."""
    uid = user.id
    counts: dict[str, int] = {}
    unclaimed = [
        (IncomeExpenseGroup, "groups"),
        (Account, "accounts"),
        (MovementType, "types"),
        (Movement, "movements"),
        (InvestmentFund, "investment_funds"),
    ] if user.is_superuser else []
    for Model, label in unclaimed:
        result = await db.execute(
            sa_update(Model).where(Model.user_id.is_(None)).values(user_id=uid).returning(Model.id)
        )
        counts[label] = len(result.fetchall())

    has_accounts = (await db.execute(select(Account.id).where(Account.user_id == uid).limit(1))).first()
    if not has_accounts:
        await _seed_defaults(db, uid)
        counts["seeded"] = True

    await db.commit()
    return {"claimed": counts}


class AdminSettings(BaseModel):
    registration_open: bool
    ai_terminal_enabled: bool


@router.get("/public-settings")
async def public_settings(db: AsyncSession = Depends(get_db)):
    """Lo que la pantalla de login necesita saber antes de iniciar sesión."""
    return {"registration_open": await registration_open(db)}


@router.get("/settings", response_model=AdminSettings)
async def get_settings(db: AsyncSession = Depends(get_db), _: User = Depends(current_admin)):
    return AdminSettings(
        registration_open=await get_flag(db, REGISTRATION_OPEN),
        ai_terminal_enabled=await get_flag(db, AI_TERMINAL_ENABLED),
    )


@router.put("/settings", response_model=AdminSettings)
async def update_settings(body: AdminSettings, db: AsyncSession = Depends(get_db),
                          _: User = Depends(current_session_admin)):
    await set_flag(db, REGISTRATION_OPEN, body.registration_open)
    await set_flag(db, AI_TERMINAL_ENABLED, body.ai_terminal_enabled)
    await db.commit()
    return body
