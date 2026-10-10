from sqlalchemy import ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class MovementSplit(Base):
    """Parte de un movimiento con categoría múltiple: cuánto del importe va a cada tipo."""
    __tablename__ = "movement_splits"

    id: Mapped[int] = mapped_column(primary_key=True)
    movement_id: Mapped[int] = mapped_column(
        ForeignKey("movements.id", ondelete="CASCADE"), nullable=False, index=True
    )
    movement_type_id: Mapped[int] = mapped_column(
        ForeignKey("movement_types.id", ondelete="CASCADE"), nullable=False, index=True
    )
    money: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    movement: Mapped["Movement"] = relationship(back_populates="splits")
