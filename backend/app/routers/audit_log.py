import json
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.audit_log import AuditLog
from app.auth.setup import current_active_user
from app.models.user import User

router = APIRouter(prefix="/audit-log", tags=["audit_log"])


class AuditLogRead(BaseModel):
    id: int
    created_at: datetime
    entity_type: str
    entity_id: int | None
    action: str
    summary: str
    before: dict | None
    after: dict | None


def _parse(entry: AuditLog) -> AuditLogRead:
    return AuditLogRead(
        id=entry.id,
        created_at=entry.created_at,
        entity_type=entry.entity_type,
        entity_id=entry.entity_id,
        action=entry.action,
        summary=entry.summary,
        before=json.loads(entry.before) if entry.before else None,
        after=json.loads(entry.after) if entry.after else None,
    )


@router.get("", response_model=list[AuditLogRead])
async def list_audit_log(
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.user_id == user.id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return [_parse(e) for e in result.scalars().all()]


@router.delete("", status_code=204)
async def clear_audit_log(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    await db.execute(sa_delete(AuditLog).where(AuditLog.user_id == user.id))
    await db.commit()
