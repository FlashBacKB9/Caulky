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

    model_config = {"from_attributes": True}


class AccountCreate(BaseModel):
    name: str
    color: str = "#6b7280"
    icon: str = "wallet"
    initial_balance: float = 0.0

class AccountPatch(BaseModel):
    name: str | None = None
    color: str | None = None
    icon: str | None = None
    initial_balance: float | None = None

class AccountUpdate(BaseModel):
    initial_balance: float
