from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, and_, extract
from sqlalchemy.orm import contains_eager
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.income_expense_group import IncomeExpenseGroup
from app.models.movement_type import MovementType
from app.models.movement import Movement
from app.models.account import Account
from app.services.calculations import compute_dinero, MONTH_NAMES, monthly_value
from app.routers.accounts import _compute_balances

router = APIRouter(prefix="/stats", tags=["stats"])

SAVINGS_GROUPS = {"Ahorro", "Gastos Anuales", "Inversión"}


def _groups_with_year(year: int):
    """Build a query that loads groups+types+movements filtered to the given year at the DB level."""
    return (
        select(IncomeExpenseGroup)
        .outerjoin(MovementType, MovementType.income_expense_group_id == IncomeExpenseGroup.id)
        .outerjoin(
            Movement,
            and_(
                Movement.movement_type_id == MovementType.id,
                extract("year", Movement.date) == year,
            ),
        )
        .options(
            contains_eager(IncomeExpenseGroup.movement_types)
            .contains_eager(MovementType.movements)
        )
        .order_by(IncomeExpenseGroup.id)
    )


@router.get("/annual")
async def annual_stats(year: int = Query(default=date.today().year), db: AsyncSession = Depends(get_db)):
    result = await db.execute(_groups_with_year(year))
    groups = result.unique().scalars().all()

    output = []
    for group in groups:
        if group.is_total:
            continue
        group_monthly = {m: 0.0 for m in MONTH_NAMES}
        types_out = []

        for mt in group.movement_types:
            mt_monthly = {m: 0.0 for m in MONTH_NAMES}
            for mv in mt.movements:
                dinero = compute_dinero(float(mv.money), group.name)
                for i, month_name in enumerate(MONTH_NAMES, start=1):
                    val = monthly_value(dinero, mv.date, i, mv.no_count)
                    mt_monthly[month_name] += val
                    group_monthly[month_name] += val

            total = sum(mt_monthly.values())
            non_zero = [v for v in mt_monthly.values() if v != 0]
            media = total / len(non_zero) if non_zero else 0.0
            current_month_name = MONTH_NAMES[date.today().month - 1]
            types_out.append({
                "id": mt.id,
                "name": mt.name,
                "category": mt.category,
                "monthly": mt_monthly,
                "total": total,
                "media": media,
                "current_month": mt_monthly[current_month_name],
            })

        group_total = sum(group_monthly.values())
        non_zero_group = [v for v in group_monthly.values() if v != 0]
        group_media = group_total / len(non_zero_group) if non_zero_group else 0.0
        current_month_name = MONTH_NAMES[date.today().month - 1]
        output.append({
            "id": group.id,
            "name": group.name,
            "color": group.color,
            "budget": float(group.budget) if group.budget else None,
            "initial_balance": float(group.initial_balance) if group.initial_balance else None,
            "monthly": group_monthly,
            "total": group_total,
            "media": group_media,
            "absolute_total": group_total + (float(group.initial_balance) if group.initial_balance else 0),
            "current_month": group_monthly[current_month_name],
            "movement_types": types_out,
        })

    return {"year": year, "groups": output}


@router.get("/dashboard")
async def dashboard(
    year: int = Query(default=date.today().year),
    month: Optional[int] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    current_month = month if month is not None else today.month
    current_month_name = MONTH_NAMES[current_month - 1]

    result = await db.execute(_groups_with_year(year))
    groups = result.unique().scalars().all()

    annual = {"income": 0.0, "expenses": 0.0, "savings": 0.0}
    monthly = {"income": 0.0, "expenses": 0.0, "savings": 0.0}
    budget_groups = []

    for group in groups:
        if group.is_total:
            continue

        group_annual = 0.0
        group_monthly = 0.0

        for mt in group.movement_types:
            for mv in mt.movements:
                if mv.no_count:
                    continue
                dinero = compute_dinero(float(mv.money), group.name)
                group_annual += dinero
                if mv.date.month == current_month:
                    group_monthly += dinero

        if group.name == "Ingreso":
            annual["income"] += group_annual
            monthly["income"] += group_monthly
        elif group.name in SAVINGS_GROUPS:
            annual["savings"] += group_annual
            monthly["savings"] += group_monthly
        else:
            annual["expenses"] += group_annual
            monthly["expenses"] += group_monthly

        if group.budget:
            budget_groups.append({
                "name": group.name,
                "color": group.color,
                "budget": float(group.budget),
                "current_month": group_monthly,
                "percent": min(100, round(abs(group_monthly) / float(group.budget) * 100, 1)),
            })

    accounts_result = await db.execute(select(Account).order_by(Account.sort_order))
    accounts = accounts_result.scalars().all()
    balances = await _compute_balances(db)
    account_map = {a.name: float(a.initial_balance) + balances.get(a.id, 0.0) for a in accounts}

    uso_balance = account_map.get("De uso", 0.0)
    ahorro_balance = (
        account_map.get("Ahorro", 0.0)
        + account_map.get("Ahorro Capricho", 0.0)
        + account_map.get("Emergencia", 0.0)
        + account_map.get("Gastos Anuales Prorrateados", 0.0)
    )

    return {
        "year": year,
        "month": current_month_name,
        "uso_balance": uso_balance,
        "ahorro_balance": ahorro_balance,
        "annual": annual,
        "monthly": monthly,
        "budget_groups": budget_groups,
    }
