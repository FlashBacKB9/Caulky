"""Copias diarias de la base (Ajustes → Copia de seguridad).

Solo el administrador. Descargar una copia (lleva los datos de todos los usuarios) y volver
a ella exigen la sesión del navegador, nunca una clave de API; volver a una copia exige
además escribir su fecha. Ver ``services/db_backups.py``.
"""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.models.user import User
from app.services import db_backups
from app.services.admin import current_admin, current_session_admin
from app.services.db_backups import BackupError

router = APIRouter(prefix="/db-backups", tags=["db-backups"])


class RestoreBody(BaseModel):
    name: str
    confirm: str


@router.get("")
async def list_backups(_: User = Depends(current_admin)):
    return db_backups.overview()


@router.get("/restore-status")
async def restore_status(_: User = Depends(current_admin)):
    return {"restore": db_backups.restore_status()}


@router.post("/restore", status_code=202)
async def restore(body: RestoreBody, background: BackgroundTasks, _: User = Depends(current_session_admin)):
    try:
        db_backups.request_restore(body.name, body.confirm)
    except BackupError as exc:
        raise HTTPException(400, detail=str(exc))
    restarting = db_backups.schedule_restart()
    return {"ok": True, "restarting": restarting}


@router.get("/file/{name}")
async def download(name: str, _: User = Depends(current_session_admin)):
    try:
        path = db_backups.file_path(name)
    except BackupError as exc:
        raise HTTPException(404, detail=str(exc))
    return FileResponse(path, media_type="application/octet-stream", filename=name)
