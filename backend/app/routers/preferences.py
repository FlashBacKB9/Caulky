from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user_preference import UserPreference
from app.auth.setup import current_active_user
from app.models.user import User

router = APIRouter(prefix="/preferences", tags=["preferences"])


class PrefValue(BaseModel):
    value: str


@router.get("")
async def get_preferences(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(UserPreference).where(UserPreference.user_id == user.id)
    )
    prefs = result.scalars().all()
    return {p.key: p.value for p in prefs}


@router.put("/{key}")
async def set_preference(
    key: str,
    body: PrefValue,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(UserPreference).where(
            UserPreference.user_id == user.id,
            UserPreference.key == key,
        )
    )
    pref = result.scalar_one_or_none()
    if pref is None:
        pref = UserPreference(user_id=user.id, key=key, value=body.value)
        db.add(pref)
    else:
        pref.value = body.value
    await db.commit()
    return {"key": key, "value": body.value}
