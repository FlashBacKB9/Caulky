from datetime import date
from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Movement(Base):
    __tablename__ = "movements"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    money: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    bank_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    movement_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("movement_types.id"), nullable=True
    )
    paid: Mapped[bool] = mapped_column(Boolean, default=True)
    no_count: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id"), nullable=True
    )
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)
    shared_between: Mapped[int | None] = mapped_column(Integer, nullable=True)
    my_share: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)

    movement_type: Mapped["MovementType | None"] = relationship(back_populates="movements")
    account: Mapped["Account | None"] = relationship(back_populates="movements")
    files: Mapped[list["MovementFile"]] = relationship(
        back_populates="movement", cascade="all, delete-orphan", lazy="selectin"
    )
