import datetime
from pydantic import BaseModel, field_validator


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
    new_car: bool = False
    interest_enabled: bool = False
    interest_type_id: int | None = None
    interest_tax_rate: float | None = None
    credit_limit: float | None = None
    credit_cutoff_day: int | None = None
    credit_charge_day: int | None = None
    credit_pay_account_id: int | None = None
    credit_auto_charge: bool = True
    credit_last_cycle_end: datetime.date | None = None
    # Crédito disponible: tope + saldo (el saldo de una tarjeta es la deuda, en negativo)
    credit_available: float | None = None

    model_config = {"from_attributes": True}


class AccountCreate(BaseModel):
    name: str
    color: str = "#6b7280"
    icon: str = "wallet"
    initial_balance: float = 0.0
    category: str = "corriente"
    depreciation_rate: float | None = None
    value_date: datetime.date | None = None
    new_car: bool = False
    interest_enabled: bool = False
    interest_type_id: int | None = None
    interest_tax_rate: float | None = None
    credit_limit: float | None = None
    credit_cutoff_day: int | None = None
    credit_charge_day: int | None = None
    credit_pay_account_id: int | None = None
    credit_auto_charge: bool = True


class AccountPatch(BaseModel):
    name: str | None = None
    color: str | None = None
    icon: str | None = None
    initial_balance: float | None = None
    category: str | None = None
    depreciation_rate: float | None = None
    value_date: datetime.date | None = None
    new_car: bool | None = None
    interest_enabled: bool | None = None
    interest_type_id: int | None = None
    interest_tax_rate: float | None = None
    credit_limit: float | None = None
    credit_cutoff_day: int | None = None
    credit_charge_day: int | None = None
    credit_pay_account_id: int | None = None
    credit_auto_charge: bool | None = None
    # Último corte ya cobrado. Retrasarlo hace que la app genere las liquidaciones de los
    # ciclos posteriores como en el uso normal (útil para dar de alta una tarjeta con historia)
    credit_last_cycle_end: datetime.date | None = None

    @field_validator("credit_last_cycle_end")
    @classmethod
    def _not_future(cls, v: datetime.date | None) -> datetime.date | None:
        if v is not None and v > datetime.date.today():
            raise ValueError("El último corte cobrado no puede ser una fecha futura")
        return v


class AccountUpdate(BaseModel):
    initial_balance: float


class CreditChargeCreate(BaseModel):
    cycle_end: datetime.date
    # Si no se indica, se usa la suma de las compras del ciclo
    amount: float | None = None


class AccountsReorder(BaseModel):
    ids: list[int]
