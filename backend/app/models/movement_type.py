import uuid
from sqlalchemy import ForeignKey, String
from sqlalchemy import Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

CATEGORY_VALUES = [
    "Ingreso", "Gasto Casa", "Transporte", "Salud", "Regalos",
    "Entretenimiento", "Suscripciones", "Vacaciones", "Vida Diaria",
    "Ahorro", "Coche", "Moto",
]


class MovementType(Base):
    __tablename__ = "movement_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    income_expense_group_id: Mapped[int] = mapped_column(
        ForeignKey("income_expense_groups.id"), nullable=False
    )
    linked_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id"), nullable=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )

    income_expense_group: Mapped["IncomeExpenseGroup"] = relationship(
        back_populates="movement_types"
    )
    movements: Mapped[list["Movement"]] = relationship(
        back_populates="movement_type", cascade="all, delete-orphan"
    )
