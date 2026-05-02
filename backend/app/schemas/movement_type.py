from pydantic import BaseModel


class MovementTypeBase(BaseModel):
    name: str
    category: str
    income_expense_group_id: int


class MovementTypeCreate(MovementTypeBase):
    color: str | None = None
    linked_account_id: int | None = None


class MovementTypeUpdate(MovementTypeBase):
    color: str | None = None
    linked_account_id: int | None = None


class MovementTypeRead(MovementTypeBase):
    id: int
    color: str | None = None
    linked_account_id: int | None = None

    model_config = {"from_attributes": True}


class MovementTypeWithStats(MovementTypeRead):
    monthly: dict[str, float] = {}
    total: float = 0.0
    media: float = 0.0
    current_month: float = 0.0
