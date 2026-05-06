import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.template import MovementTemplate
from app.schemas.template import TemplateCreate, TemplateRead, TemplateUpdate
from app.auth.setup import current_active_user
from app.models.user import User

router = APIRouter(prefix="/templates", tags=["templates"])


def _to_db_dict(body: TemplateCreate | TemplateUpdate) -> dict:
    data = body.model_dump()
    data["recurrence"] = json.dumps(data["recurrence"]) if data["recurrence"] is not None else None
    return data


@router.get("", response_model=list[TemplateRead])
async def list_templates(
    db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)
):
    result = await db.execute(
        select(MovementTemplate)
        .where(MovementTemplate.user_id == user.id)
        .order_by(MovementTemplate.id)
    )
    return result.scalars().all()


@router.post("", response_model=TemplateRead, status_code=201)
async def create_template(
    body: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    t = MovementTemplate(**_to_db_dict(body), user_id=user.id)
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


@router.put("/{template_id}", response_model=TemplateRead)
async def update_template(
    template_id: int,
    body: TemplateUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    t = await db.get(MovementTemplate, template_id)
    if not t or t.user_id != user.id:
        raise HTTPException(status_code=404, detail="Template not found")
    for k, v in _to_db_dict(body).items():
        setattr(t, k, v)
    await db.commit()
    await db.refresh(t)
    return t


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    t = await db.get(MovementTemplate, template_id)
    if not t or t.user_id != user.id:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(t)
    await db.commit()
