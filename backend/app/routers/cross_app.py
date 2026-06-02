"""Cross-app query endpoint for Caulky/Spendly.

Allows another trusted app (e.g. Hermes) to run read-only SQL queries
against the Caulky database using a long-lived per-user token instead
of a session cookie.

Authentication: `X-Cross-Token: <token>` header (or ?token= query param).
Only SELECT and WITH statements are allowed.
"""
import re
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.setup import current_active_user
from app.database import AsyncSessionLocal, get_db
from app.models.user import User
from app.models.user_preference import UserPreference

router = APIRouter(prefix="/cross-app", tags=["cross-app"])

_SELECT_RE = re.compile(r"^\s*(SELECT|WITH)\b", re.IGNORECASE)
_CROSS_TOKEN_KEY = "cross_app_token"


async def _get_token_user(db: AsyncSession, token: str) -> User | None:
    from sqlalchemy import select
    r = await db.execute(
        select(UserPreference).where(
            UserPreference.key == _CROSS_TOKEN_KEY,
            UserPreference.value == token,
        )
    )
    pref = r.scalar_one_or_none()
    if not pref:
        return None
    from app.models.user import User as UserModel
    r2 = await db.execute(
        select(UserModel).where(UserModel.id == pref.user_id)
    )
    return r2.scalar_one_or_none()


async def _get_or_create_token(db: AsyncSession, user_id) -> str:
    from sqlalchemy import select
    r = await db.execute(
        select(UserPreference).where(
            UserPreference.user_id == user_id,
            UserPreference.key == _CROSS_TOKEN_KEY,
        )
    )
    pref = r.scalar_one_or_none()
    if pref:
        return pref.value
    token = secrets.token_urlsafe(32)
    db.add(UserPreference(user_id=user_id, key=_CROSS_TOKEN_KEY, value=token))
    await db.commit()
    return token


@router.get("/token")
async def get_my_token(
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    token = await _get_or_create_token(db, user.id)
    return {"token": token}


@router.post("/token/regenerate")
async def regenerate_token(
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import delete
    await db.execute(
        delete(UserPreference).where(
            UserPreference.user_id == user.id,
            UserPreference.key == _CROSS_TOKEN_KEY,
        )
    )
    await db.commit()
    token = await _get_or_create_token(db, user.id)
    return {"token": token}


@router.get("/query")
async def cross_app_query(
    sql: str = Query(...),
    x_cross_token: str | None = Header(None, alias="X-Cross-Token"),
    token: str | None = Query(None),
):
    raw_token = x_cross_token or token
    if not raw_token:
        raise HTTPException(status_code=401, detail="X-Cross-Token header requerido")

    if not _SELECT_RE.match(sql.strip()):
        raise HTTPException(status_code=400, detail="Solo se permiten consultas SELECT/WITH")

    async with AsyncSessionLocal() as db:
        user = await _get_token_user(db, raw_token)
        if not user:
            raise HTTPException(status_code=401, detail="Token inválido")

        try:
            result = await db.execute(text(sql))
            cols = list(result.keys())
            rows = [dict(zip(cols, row)) for row in result.fetchall()]
            return {"columns": cols, "rows": rows, "count": len(rows)}
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Error SQL: {exc}")
