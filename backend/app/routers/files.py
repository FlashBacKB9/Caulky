import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.movement import Movement
from app.models.movement_file import MovementFile

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/movements", tags=["files"])


@router.post("/{movement_id}/files")
async def upload_files(movement_id: int, files: list[UploadFile], db: AsyncSession = Depends(get_db)):
    mv = await db.get(Movement, movement_id)
    if not mv:
        raise HTTPException(status_code=404, detail="Movement not found")

    saved = []
    for file in files:
        ext = os.path.splitext(file.filename or "")[1]
        unique_name = f"{uuid.uuid4().hex}{ext}"
        dest = os.path.join(UPLOAD_DIR, unique_name)
        content = await file.read()
        with open(dest, "wb") as f:
            f.write(content)
        record = MovementFile(
            movement_id=movement_id,
            filename=unique_name,
            original_name=file.filename or unique_name,
            mime_type=file.content_type or "application/octet-stream",
        )
        db.add(record)
        await db.flush()
        saved.append({"id": record.id, "original_name": record.original_name, "mime_type": record.mime_type})

    await db.commit()
    return saved


@router.get("/{movement_id}/files")
async def list_files(movement_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MovementFile).where(MovementFile.movement_id == movement_id)
    )
    return [
        {"id": f.id, "original_name": f.original_name, "mime_type": f.mime_type, "created_at": f.created_at}
        for f in result.scalars().all()
    ]


@router.get("/files/{file_id}/download")
async def download_file(file_id: int, db: AsyncSession = Depends(get_db)):
    f = await db.get(MovementFile, file_id)
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    path = os.path.join(UPLOAD_DIR, f.filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File missing on disk")
    return FileResponse(path, filename=f.original_name, media_type=f.mime_type)


@router.delete("/files/{file_id}", status_code=204)
async def delete_file(file_id: int, db: AsyncSession = Depends(get_db)):
    f = await db.get(MovementFile, file_id)
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    path = os.path.join(UPLOAD_DIR, f.filename)
    if os.path.exists(path):
        os.remove(path)
    await db.delete(f)
    await db.commit()
