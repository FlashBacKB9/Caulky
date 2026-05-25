import uuid
from sqlalchemy import Boolean, Date, ForeignKey, Numeric, String, Text, Integer
from sqlalchemy import Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import datetime


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#6b7280")
    icon: Mapped[str] = mapped_column(String(50), nullable=False, default="wallet")
    initial_balance: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_main: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False, default="corriente")
    depreciation_rate: Mapped[float | None] = mapped_column(Numeric(6, 4), nullable=True)
    value_date: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )

    movements: Mapped[list["Movement"]] = relationship(back_populates="account")
