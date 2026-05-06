import json
from typing import Optional, Any
from pydantic import BaseModel, field_validator


class TemplateBase(BaseModel):
    label: str
    name: str = ""
    money: str = "0"
    date_mode: str = "today"
    bank_date_mode: str = "manual"
    movement_type_id: Optional[int] = None
    paid: bool = True
    no_count: bool = False
    notes: str = ""
    recurrence: Optional[Any] = None


class TemplateCreate(TemplateBase):
    pass


class TemplateUpdate(TemplateBase):
    pass


class TemplateRead(TemplateBase):
    id: int

    @field_validator("recurrence", mode="before")
    @classmethod
    def parse_recurrence(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, ValueError):
                return None
        return v

    model_config = {"from_attributes": True}
