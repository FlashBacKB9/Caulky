import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy import Uuid
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AuditLog(Base):
    """Historial de actividad (Ajustes → Sistema). Ver `services/audit.py`.

    Dos clases de entrada, unidas por `group_id` (una transacción = una operación):
    - Resumen (`table_name` vacío): la frase que escribe cada endpoint con `write_log`.
    - Fila (`table_name` puesto): lo que los listeners de SQLAlchemy ven cambiar.
      `before` = fila entera borrada o valores anteriores de un cambio; `after` = fila
      entera creada o fila entera tras el cambio. Con esto se deshace.
    Las entradas de antes de existir el deshacer no tienen `group_id`.
    """
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_table_row", "table_name", "row_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    summary: Mapped[str] = mapped_column(String(500), nullable=False)
    before: Mapped[str | None] = mapped_column(Text, nullable=True)
    after: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False, server_default='user')
    group_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    table_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    row_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    restored_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
