import uuid
from sqlalchemy import ForeignKey, String, Boolean, Text
from sqlalchemy import Uuid
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class MovementTemplate(Base):
    __tablename__ = "movement_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False, server_default="")
    money: Mapped[str] = mapped_column(String(50), nullable=False, server_default="0")
    date_mode: Mapped[str] = mapped_column(String(20), nullable=False, server_default="today")
    bank_date_mode: Mapped[str] = mapped_column(String(20), nullable=False, server_default="manual")
    movement_type_id: Mapped[int | None] = mapped_column(nullable=True)
    paid: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    no_count: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    notes: Mapped[str] = mapped_column(String(2000), nullable=False, server_default="")
    recurrence: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string
