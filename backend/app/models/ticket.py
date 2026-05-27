import uuid
from datetime import datetime, date
from sqlalchemy import ForeignKey, String, Text, Float, Date, DateTime, func
from sqlalchemy import Uuid
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    original_name: Mapped[str] = mapped_column(String(500), nullable=False)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    store_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    ticket_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    total: Mapped[float | None] = mapped_column(Float, nullable=True)
    items: Mapped[str] = mapped_column(Text, nullable=False, server_default="[]")
    categories: Mapped[str] = mapped_column(Text, nullable=False, server_default="{}")
    generated_movements: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
