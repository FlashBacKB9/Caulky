from pydantic import BaseModel


class RealAccountRead(BaseModel):
    id: int
    name: str
    entity_name: str
    account_number: str | None
    color: str
    linked_account_ids: list[int] = []

    model_config = {"from_attributes": True}


class RealAccountCreate(BaseModel):
    name: str
    entity_name: str
    account_number: str | None = None
    color: str = "#6b7280"
    linked_account_ids: list[int] = []


class RealAccountPatch(BaseModel):
    name: str | None = None
    entity_name: str | None = None
    account_number: str | None = None
    color: str | None = None
    linked_account_ids: list[int] | None = None
