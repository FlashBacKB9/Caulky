from pydantic import BaseModel


class IncomeExpenseGroupBase(BaseModel):
    name: str
    color: str = "#6b7280"
    initial_balance: float | None = None
    budget: float | None = None
    is_total: bool = False


class IncomeExpenseGroupCreate(IncomeExpenseGroupBase):
    pass


class IncomeExpenseGroupUpdate(IncomeExpenseGroupBase):
    pass


class IncomeExpenseGroupRead(IncomeExpenseGroupBase):
    id: int

    model_config = {"from_attributes": True}


class IncomeExpenseGroupWithStats(IncomeExpenseGroupRead):
    monthly: dict[str, float] = {}
    total: float = 0.0
    current_month: float = 0.0
    absolute_total: float = 0.0
