import uuid
from fastapi_users import FastAPIUsers
from fastapi_users.authentication import AuthenticationBackend, CookieTransport, JWTStrategy
from app.auth.manager import get_user_manager
from app.models.user import User
from app.config import settings
from app.auth.api_key import api_key_backend

cookie_transport = CookieTransport(
    cookie_name="caulkyauth",
    cookie_max_age=3600 * 24 * 30,
    cookie_httponly=True,
    cookie_secure=settings.COOKIE_SECURE,
    cookie_samesite="lax",
)


def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(secret=settings.SECRET_KEY, lifetime_seconds=3600 * 24 * 30)


auth_backend = AuthenticationBackend(
    name="cookie",
    transport=cookie_transport,
    get_strategy=get_jwt_strategy,
)

fastapi_users = FastAPIUsers[User, uuid.UUID](
    get_user_manager,
    [auth_backend, api_key_backend],
)

current_active_user = fastapi_users.current_user(active=True)


def _session_backends():
    return [auth_backend]


# Solo sesión del navegador: para lo que una clave API filtrada no debe poder hacer
# (gestionar claves, borrar todo)
current_session_user = fastapi_users.current_user(active=True, get_enabled_backends=_session_backends)
