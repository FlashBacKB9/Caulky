from sqlalchemy import Boolean, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class IncomeExpenseGroup(Base):
    __tablename__ = "income_expense_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#6b7280")
    initial_balance: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    budget: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    is_total: Mapped[bool] = mapped_column(Boolean, default=False)

    movement_types: Mapped[list["MovementType"]] = relationship(
        back_populates="income_expense_group", cascade="all, delete-orphan"
    )
