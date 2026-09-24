from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.api_key import generate_key, hash_key
from app.auth.setup import current_session_user
from app.database import get_db
from app.models.api_key import ApiKey
from app.models.user import User

# Solo con sesión del navegador: una clave API no puede crear ni revocar claves
router = APIRouter(prefix="/api-keys", tags=["api-keys"])


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class ApiKeyRead(BaseModel):
    id: int
    name: str
    prefix: str
    created_at: datetime
    last_used_at: datetime | None

    model_config = {"from_attributes": True}


class ApiKeyCreated(ApiKeyRead):
    key: str


@router.get("", response_model=list[ApiKeyRead])
async def list_api_keys(db: AsyncSession = Depends(get_db), user: User = Depends(current_session_user)):
    result = await db.execute(
        select(ApiKey).where(ApiKey.user_id == user.id).order_by(ApiKey.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=ApiKeyCreated, status_code=201)
async def create_api_key(
    body: ApiKeyCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_session_user),
):
    key = generate_key()
    api_key = ApiKey(
        user_id=user.id,
        name=body.name.strip(),
        prefix=key[:10],
        key_hash=hash_key(key),
        created_at=datetime.utcnow(),
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)
    # La clave completa solo sale en esta respuesta
    return ApiKeyCreated(**ApiKeyRead.model_validate(api_key).model_dump(), key=key)


@router.delete("/{key_id}", status_code=204)
async def revoke_api_key(
    key_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_session_user),
):
    api_key = await db.get(ApiKey, key_id)
    if api_key is None or api_key.user_id != user.id:
        raise HTTPException(status_code=404, detail="API key not found")
    await db.delete(api_key)
    await db.commit()
