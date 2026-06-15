import uuid
from sqlalchemy import Column, ForeignKey, Integer, String, Table
from sqlalchemy import Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

real_account_accounts = Table(
    "real_account_accounts",
    Base.metadata,
    Column("real_account_id", Integer, ForeignKey("real_accounts.id", ondelete="CASCADE"), primary_key=True),
    Column("account_id", Integer, ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True),
)


class RealAccount(Base):
    __tablename__ = "real_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_name: Mapped[str] = mapped_column(String(100), nullable=False)
    account_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#6b7280")
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )

    linked_accounts: Mapped[list["Account"]] = relationship(
        secondary=real_account_accounts,
        lazy="selectin",
    )
