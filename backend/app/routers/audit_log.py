"""Historial de actividad (Ajustes → Sistema): ver lo que ha pasado y deshacerlo.

Las entradas las escribe `services/audit.py`. `/operations` las agrupa por operación
(una transacción = un `group_id`) con su frase y sus filas. Deshacer es solo del
administrador y con la sesión del navegador (nunca con una clave de API), por operación
entera o por filas sueltas; las filas que van en pareja se deshacen juntas.
"""
import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import String, cast, delete as sa_delete, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.setup import current_active_user
from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.services import audit
from app.services.admin import current_session_admin, is_demo

router = APIRouter(prefix="/audit-log", tags=["audit_log"])

OPS_PER_PAGE = 30
ROWS_PER_OP = 50


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
    """Lista plana de frases (para descargar el historial)."""
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.user_id == user.id, AuditLog.table_name.is_(None))
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return [_parse(e) for e in result.scalars().all()]


def _row(e: AuditLog, bundle: int | None) -> dict:
    before = audit._loads(e.before) or {}
    after = audit._loads(e.after) or {}
    if e.action == "update":
        unknown = set(before.pop("_unknown", []) or [])
        changes = {k: [v, after.get(k)] for k, v in before.items()}
        for k in unknown:
            changes[k] = [None, after.get(k)]
        data = after
    else:
        changes = None
        data = before if e.action == "delete" else after
    return {
        "id": e.id,
        "table": e.table_name,
        "action": e.action,
        "row_id": e.row_id,
        "label": e.summary,
        "changes": changes,
        "data": data,
        "restored_at": e.restored_at.isoformat() if e.restored_at else None,
        "bundle": bundle,
    }


def _state(summaries: list[AuditLog], rows_total: int, rows_left: int, group_id: str | None,
           created_at: datetime, source: str) -> tuple[str, str | None]:
    """(estado, motivo) del botón Deshacer de una operación."""
    if source == "undo":
        return "undo", None
    if group_id is None:
        if source == "ai":
            return "old", "Hecho por el asistente de IA con SQL directo: no se puede deshacer desde aquí"
        if summaries and summaries[0].entity_type == "auth":
            return "none", None
        return "old", "Registrado antes de poder deshacer: no guardó los datos para volver atrás"
    if rows_total == 0:
        if summaries and summaries[0].entity_type == "auth":
            return "none", None
        if created_at < datetime.utcnow() - timedelta(days=audit.RETENTION_DAYS):
            return "old", f"Los datos para deshacer se guardan {audit.RETENTION_DAYS} días"
        if any(s.restored_at for s in summaries):
            return "done", None
        return "none", None
    if rows_left == 0:
        return "done", None
    if rows_left < rows_total:
        return "partial", None
    return "ok", None


@router.get("/operations")
async def list_operations(
    before: int | None = Query(None, description="Operaciones anteriores a esta entrada"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    """Las últimas operaciones, la más reciente primero: sus frases, un recuento por tabla y
    acción, y sus primeras filas con el bloque al que pertenece cada una."""
    key = func.coalesce(AuditLog.group_id, literal("e") + cast(AuditLog.id, String)).label("k")
    last = func.max(AuditLog.id).label("last")
    q = (select(key, last).where(AuditLog.user_id == user.id)
         .group_by(key).order_by(last.desc()).limit(OPS_PER_PAGE))
    if before is not None:
        q = q.having(func.max(AuditLog.id) < before)
    groups = (await db.execute(q)).all()

    out = []
    for k, last_id in groups:
        if "-" not in k and k.startswith("e") and k[1:].isdigit():   # entrada de antes, sin operación
            cond = AuditLog.id == int(k[1:])
            gid = None
        else:
            cond = AuditLog.group_id == k
            gid = k
        summaries = list((await db.execute(
            select(AuditLog).where(AuditLog.user_id == user.id, cond, AuditLog.table_name.is_(None))
            .order_by(AuditLog.id))).scalars())
        counts = (await db.execute(
            select(AuditLog.table_name, AuditLog.action, func.count(), func.count(AuditLog.restored_at))
            .where(AuditLog.user_id == user.id, cond, AuditLog.table_name.is_not(None))
            .group_by(AuditLog.table_name, AuditLog.action))).all()
        total = sum(n for _, _, n, _ in counts)
        left = total - sum(r for _, _, _, r in counts)
        rows: list[AuditLog] = []
        bmap: dict[int, int] = {}
        if total:
            if total <= audit.MAX_ROWS_PER_ROW_UNDO:
                rows = list((await db.execute(
                    select(AuditLog).where(AuditLog.user_id == user.id, cond, AuditLog.table_name.is_not(None))
                    .order_by(AuditLog.id))).scalars())
                bmap = audit.bundles(rows)
            else:
                rows = list((await db.execute(
                    select(AuditLog).where(AuditLog.user_id == user.id, cond, AuditLog.table_name.is_not(None))
                    .order_by(AuditLog.id).limit(ROWS_PER_OP))).scalars())
        first = summaries[0] if summaries else rows[0]
        source = (summaries[0].source if summaries else rows[0].source) or "user"
        state, reason = _state(summaries, total, left, gid, first.created_at, source)
        # Bloques numerados 1, 2, 3… en el orden en que aparecen
        numbering: dict[int, int] = {}
        for e in rows:
            if e.id in bmap:
                numbering.setdefault(bmap[e.id], len(numbering) + 1)
        out.append({
            "key": k,
            "group_id": gid,
            "last_id": last_id,
            "created_at": first.created_at.isoformat(),
            "source": source,
            "summaries": [{"id": s.id, "action": s.action, "entity_type": s.entity_type,
                           "summary": s.summary} for s in summaries],
            "counts": [{"table": t, "action": a, "count": n, "restored": r} for t, a, n, r in counts],
            "total_rows": total,
            "rows_left": left,
            "bundles": len(numbering) if bmap else None,
            "rows": [_row(e, numbering.get(bmap[e.id]) if e.id in bmap else None) for e in (rows if bmap else rows[:ROWS_PER_OP])],
            "state": state,
            "reason": reason,
        })
    return {
        "operations": out,
        "next_before": out[-1]["last_id"] if len(out) == OPS_PER_PAGE else None,
    }


class UndoBody(BaseModel):
    group_id: str | None = None
    ids: list[int] | None = None


@router.post("/undo")
async def undo(
    body: UndoBody,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_session_admin),
):
    """Deshace una operación entera (`group_id`) o unas filas (`ids`, que arrastran a las
    que van en pareja con ellas). Todo o nada: si algo no se puede, 409 con los motivos."""
    if is_demo(user):
        raise HTTPException(403, "No disponible en el modo de prueba")
    if not body.group_id and not body.ids:
        raise HTTPException(400, "Indica qué deshacer")
    entries = await audit.expand_selection(db, user.id, group_id=body.group_id, ids=body.ids)
    if not entries:
        raise HTTPException(404, "No hay nada que deshacer en esa operación")
    try:
        return await audit.undo(db, user.id, entries)
    except audit.UndoError as exc:
        raise HTTPException(409, detail={"message": "No se ha deshecho nada", "problems": exc.problems})


@router.delete("", status_code=204)
async def clear_audit_log(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    await db.execute(sa_delete(AuditLog).where(AuditLog.user_id == user.id))
    await db.commit()
