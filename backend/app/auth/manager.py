import uuid
from typing import Optional
from fastapi import Depends, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users import BaseUserManager, UUIDIDMixin
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.config import settings
from app.auth.login_guard import client_ip
from app.services.audit import write_log


async def get_user_db(session: AsyncSession = Depends(get_db)):
    yield SQLAlchemyUserDatabase(session, User)


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.SECRET_KEY
    verification_token_secret = settings.SECRET_KEY

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        # La primera cuenta real de la instalación queda como administradora
        from app.services.admin import ensure_admin  # noqa: PLC0415 (import circular)
        await ensure_admin(self.user_db.session)

    async def on_after_login(self, user: User, request: Optional[Request] = None,
                             response: Optional[Response] = None):
        await write_log(user.id, "auth", None, "login", f"Inicio de sesión desde {client_ip.get()}")

    async def authenticate(self, credentials: OAuth2PasswordRequestForm) -> Optional[User]:
        user = await super().authenticate(credentials)
        if user is None:
            await self._log_failed_login(credentials.username)
        return user

    async def _log_failed_login(self, email: str) -> None:
        """El intento fallido va al historial del dueño de ese email; si el email no existe,
        al del administrador, para que vea quién lo intenta."""
        from app.services.admin import ensure_admin  # noqa: PLC0415 (import circular)
        ip = client_ip.get()
        try:
            owner = await self.get_by_email(email)
            summary = f"Inicio de sesión fallido desde {ip}"
        except Exception:
            owner = await ensure_admin(self.user_db.session)
            summary = f"Inicio de sesión fallido con un email que no existe ({email[:80]}) desde {ip}"
        if owner:
            await write_log(owner.id, "auth", None, "login_failed", summary)

    async def on_after_forgot_password(self, user: User, token: str, request: Optional[Request] = None):
        pass


async def get_user_manager(user_db=Depends(get_user_db)):
    yield UserManager(user_db)
