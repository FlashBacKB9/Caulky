import datetime
from pydantic import BaseModel


class AccountRead(BaseModel):
    id: int
    name: str
    description: str | None
    color: str
    icon: str
    initial_balance: float
    balance: float = 0.0
    sort_order: int
    is_main: bool = False
    category: str = "corriente"
    depreciation_rate: float | None = None
    value_date: datetime.date | None = None

    model_config = {"from_attributes": True}


class AccountCreate(BaseModel):
    name: str
    color: str = "#6b7280"
    icon: str = "wallet"
    initial_balance: float = 0.0
    category: str = "corriente"
    depreciation_rate: float | None = None
    value_date: datetime.date | None = None


class AccountPatch(BaseModel):
    name: str | None = None
    color: str | None = None
    icon: str | None = None
    initial_balance: float | None = None
    category: str | None = None
    depreciation_rate: float | None = None
    value_date: datetime.date | None = None


class AccountUpdate(BaseModel):
    initial_balance: float


class AccountsReorder(BaseModel):
    ids: list[int]
