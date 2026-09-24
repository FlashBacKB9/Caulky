"""Autenticación por clave API: `Authorization: Bearer ck_...`.

Se registra como un segundo backend de fastapi-users, así `current_active_user`
acepta tanto la cookie de sesión como una clave sin tocar los routers.
"""
import hashlib
import secrets
from datetime import datetime
from typing import Optional

from fastapi import Depends, Request
from fastapi.security import HTTPBearer
from fastapi_users.authentication import AuthenticationBackend, BearerTransport
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.api_key import ApiKey
from app.models.user import User

KEY_PREFIX = "ck_"


def generate_key() -> str:
    return KEY_PREFIX + secrets.token_urlsafe(32)


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


class ApiKeyStrategy:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def read_token(self, token: Optional[str], user_manager) -> Optional[User]:
        if not token or not token.startswith(KEY_PREFIX):
            return None
        api_key = (await self.db.execute(
            select(ApiKey).where(ApiKey.key_hash == hash_key(token))
        )).scalar_one_or_none()
        if api_key is None:
            return None
        user = await self.db.get(User, api_key.user_id)
        if user is None:
            return None
        api_key.last_used_at = datetime.utcnow()
        await self.db.commit()
        return user

    async def write_token(self, user: User) -> str:
        # Las claves se crean desde /api/api-keys, no con un login
        raise NotImplementedError

    async def destroy_token(self, token: str, user: User) -> None:
        return None


def get_api_key_strategy(db: AsyncSession = Depends(get_db)) -> ApiKeyStrategy:
    return ApiKeyStrategy(db)


class _ApiKeyScheme(HTTPBearer):
    """HTTPBearer que devuelve el token en crudo, como espera fastapi-users.

    Sustituye al OAuth2PasswordBearer de BearerTransport para que en /api/docs el
    botón Authorize pida la clave directamente, no un usuario y contraseña.
    """
    async def __call__(self, request: Request) -> Optional[str]:  # type: ignore[override]
        creds = await super().__call__(request)
        return creds.credentials if creds else None


_transport = BearerTransport(tokenUrl="auth/login")
_transport.scheme = _ApiKeyScheme(auto_error=False, scheme_name="ApiKey",
                                  description="Clave generada en Configuración → API (ck_...)")

api_key_backend = AuthenticationBackend(
    name="api_key",
    transport=_transport,
    get_strategy=get_api_key_strategy,
)
