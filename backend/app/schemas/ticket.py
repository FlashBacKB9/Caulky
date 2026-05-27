import json
from datetime import datetime, date
from typing import Optional, Any
from pydantic import BaseModel, field_validator


class TicketItem(BaseModel):
    name: str
    amount: float
    category: str


class TicketRead(BaseModel):
    id: int
    original_name: str
    mime_type: str
    store_name: Optional[str] = None
    ticket_date: Optional[date] = None
    total: Optional[float] = None
    items: list[TicketItem]
    categories: dict[str, float]
    generated_movements: Optional[dict] = None
    created_at: datetime

    @field_validator("items", mode="before")
    @classmethod
    def parse_items(cls, v: Any) -> Any:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, ValueError):
                return []
        return v

    @field_validator("categories", mode="before")
    @classmethod
    def parse_categories(cls, v: Any) -> Any:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, ValueError):
                return {}
        return v

    @field_validator("generated_movements", mode="before")
    @classmethod
    def parse_generated_movements(cls, v: Any) -> Any:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, ValueError):
                return None
        return v

    model_config = {"from_attributes": True}
