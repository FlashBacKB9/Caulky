from datetime import date as Date
from pydantic import BaseModel


class PurchaseRead(BaseModel):
    movement_id: int
    date: Date
    bank_date: Date | None
    amount_eur: float
    notes: str | None
    price_at_purchase: float | None
    units: float | None


class FundRead(BaseModel):
    id: int
    name: str
    ticker: str | None
    color: str
    notes: str | None
    movement_type_id: int | None
    current_price: float | None
    current_value_override: float | None
    # computed
    total_invested: float
    total_units: float | None
    current_value: float | None
    gain_eur: float | None
    gain_pct: float | None
    purchases: list[PurchaseRead]

    model_config = {"from_attributes": True}


class FundCreate(BaseModel):
    name: str
    ticker: str | None = None
    color: str = "#6366f1"
    notes: str | None = None
    movement_type_id: int | None = None


class FundPatch(BaseModel):
    name: str | None = None
    ticker: str | None = None
    color: str | None = None
    notes: str | None = None
    movement_type_id: int | None = None
    current_price: float | None = None
    current_value_override: float | None = None


class PurchasePatch(BaseModel):
    price_at_purchase: float | None = None
    units: float | None = None
