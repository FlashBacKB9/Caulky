from datetime import date

MONTH_NAMES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]


def compute_dinero(money: float, group_name: str) -> float:
    """Apply sign logic: income groups are positive, expenses negative. Negative money = refund (inverts)."""
    is_income = group_name == "Ingreso"
    if money < 0:
        # refund: always positive effect
        return abs(money)
    return abs(money) if is_income else -abs(money)


def compute_label(money: float, group_name: str) -> str:
    if money < 0:
        return "Devolución"
    return "Ingreso" if group_name == "Ingreso" else "Gasto"


def monthly_value(dinero: float, movement_date: date, month: int, no_count: bool) -> float:
    if no_count or movement_date.month != month:
        return 0.0
    return dinero


def aggregate_monthly(movements_data: list[dict]) -> dict[str, float]:
    totals = {m: 0.0 for m in MONTH_NAMES}
    for mv in movements_data:
        for i, month_name in enumerate(MONTH_NAMES, start=1):
            totals[month_name] += monthly_value(
                mv["dinero"], mv["date"], i, mv["no_count"]
            )
    return totals
