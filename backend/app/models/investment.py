import uuid
from sqlalchemy import ForeignKey, Numeric, String, Text
from sqlalchemy import Uuid
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class InvestmentFund(Base):
    __tablename__ = "investment_funds"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    ticker: Mapped[str | None] = mapped_column(String(50), nullable=True)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#6366f1")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_price: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    current_value_override: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    movement_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("movement_types.id", ondelete="SET NULL"), nullable=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )


class InvestmentPurchase(Base):
    """Supplement data for a movement that represents a purchase of a fund."""
    __tablename__ = "investment_purchases"

    id: Mapped[int] = mapped_column(primary_key=True)
    movement_id: Mapped[int] = mapped_column(
        ForeignKey("movements.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    price_at_purchase: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    units: Mapped[float | None] = mapped_column(Numeric(14, 6), nullable=True)
