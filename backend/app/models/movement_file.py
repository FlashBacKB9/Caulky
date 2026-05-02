from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class MovementFile(Base):
    __tablename__ = "movement_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    movement_id: Mapped[int] = mapped_column(ForeignKey("movements.id", ondelete="CASCADE"), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)   # nombre en disco (uuid)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)  # nombre original
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    movement: Mapped["Movement"] = relationship(back_populates="files")
