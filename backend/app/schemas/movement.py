from __future__ import annotations
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel

# Alias avoids Python 3.14 shadowing: a field named 'date' with default=None
# overwrites 'date' in the class namespace before pydantic resolves annotations.
_Date = date


class MovementFileRead(BaseModel):
    id: int
    original_name: str
    mime_type: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MovementBase(BaseModel):
    name: str
    money: float
    date: _Date
    bank_date: Optional[_Date] = None
    movement_type_id: Optional[int] = None
    account_id: Optional[int] = None
    paid: bool = True
    no_count: bool = False
    notes: Optional[str] = None


class MovementCreate(MovementBase):
    pass


class MovementUpdate(BaseModel):
    """All fields optional — supports partial (field-only) updates."""
    name: Optional[str] = None
    money: Optional[float] = None
    date: Optional[_Date] = None
    bank_date: Optional[_Date] = None
    movement_type_id: Optional[int] = None
    account_id: Optional[int] = None
    paid: Optional[bool] = None
    no_count: Optional[bool] = None
    notes: Optional[str] = None


class MovementRead(MovementBase):
    id: int
    dinero: float = 0.0
    label: str = "Gasto"
    color: str = "#6b7280"
    files: list[MovementFileRead] = []

    model_config = {"from_attributes": True}
