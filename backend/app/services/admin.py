"""Administración de la instalación: quién es el administrador y los ajustes globales.

El administrador es el usuario con `is_superuser`. Si no hay ninguno, se nombra al primer
usuario real: el dueño de la cuenta más antigua (la tabla de usuarios no guarda fecha de
alta) y, si nadie tiene cuentas, el primero por email. El usuario demo nunca lo es.
"""
from fastapi import Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.setup import current_active_user, current_session_user
from app.models.account import Account
from app.models.app_setting import AppSetting
from app.models.user import User

DEMO_EMAIL = "demo@caulky.app"

# Ajustes globales y su valor por defecto
REGISTRATION_OPEN = "registration_open"
AI_TERMINAL_ENABLED = "ai_terminal_enabled"
DEFAULTS = {REGISTRATION_OPEN: False, AI_TERMINAL_ENABLED: True}


def is_demo(user: User) -> bool:
    return user.email.lower() == DEMO_EMAIL


async def get_flag(db: AsyncSession, key: str) -> bool:
    row = await db.get(AppSetting, key)
    return DEFAULTS[key] if row is None else row.value == "true"


async def set_flag(db: AsyncSession, key: str, value: bool) -> None:
    row = await db.get(AppSetting, key)
    if row is None:
        db.add(AppSetting(key=key, value="true" if value else "false"))
    else:
        row.value = "true" if value else "false"


async def ensure_admin(db: AsyncSession) -> User | None:
    """Devuelve el administrador, nombrándolo si aún no hay ninguno."""
    admin = (await db.execute(select(User).where(User.is_superuser == True).limit(1))).scalar_one_or_none()  # noqa: E712
    if admin:
        return admin
    # Se ordena en Python: en SQLite users.id y accounts.user_id guardan el UUID con formatos
    # distintos y un JOIN entre ellos no casa
    first_account = dict((await db.execute(
        select(Account.user_id, func.min(Account.id)).group_by(Account.user_id)
    )).all())
    users = (await db.execute(
        select(User).where(func.lower(User.email) != DEMO_EMAIL, User.is_active == True)  # noqa: E712
    )).scalars().all()
    admin = min(users, key=lambda u: (first_account.get(u.id) is None, first_account.get(u.id) or 0, u.email),
                default=None)
    if admin:
        admin.is_superuser = True
        await db.commit()
    return admin


async def registration_open(db: AsyncSession) -> bool:
    """El registro está abierto si el admin lo permite o si aún no hay ningún usuario real
    (la primera cuenta de una instalación nueva siempre se puede crear)."""
    has_real_user = (await db.execute(
        select(User.id).where(func.lower(User.email) != DEMO_EMAIL).limit(1)
    )).first()
    return not has_real_user or await get_flag(db, REGISTRATION_OPEN)


async def current_admin(user: User = Depends(current_active_user)) -> User:
    if not user.is_superuser or is_demo(user):
        raise HTTPException(403, "Solo el administrador puede hacer esto")
    return user


async def current_session_admin(user: User = Depends(current_session_user)) -> User:
    """Administrador con sesión del navegador: una clave API no cambia ajustes globales."""
    return await current_admin(user)
