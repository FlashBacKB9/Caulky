import json
import uuid
from datetime import datetime, timezone
from app.database import AsyncSessionLocal
from app.models.audit_log import AuditLog


def _dumps(d: dict | None) -> str | None:
    if d is None:
        return None
    return json.dumps(d, default=str, ensure_ascii=False)


async def write_log(
    user_id: uuid.UUID,
    entity_type: str,
    entity_id: int | None,
    action: str,
    summary: str,
    before: dict | None = None,
    after: dict | None = None,
) -> None:
    """Write an audit log entry using its own DB session. Never raises."""
    try:
        async with AsyncSessionLocal() as db:
            db.add(AuditLog(
                user_id=user_id,
                created_at=datetime.now(timezone.utc),
                entity_type=entity_type,
                entity_id=entity_id,
                action=action,
                summary=summary,
                before=_dumps(before),
                after=_dumps(after),
            ))
            await db.commit()
    except Exception as e:
        print(f"[audit] write_log failed: {e}", flush=True)
