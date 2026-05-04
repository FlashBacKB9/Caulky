"""Admin endpoints — e.g. claim pre-existing unclaimed data after first login."""
from fastapi import APIRouter, Depends
from sqlalchemy import update as sa_update, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.account import Account
from app.models.income_expense_group import IncomeExpenseGroup
from app.models.investment import InvestmentFund
from app.models.movement import Movement
from app.models.movement_type import MovementType
from app.auth.setup import current_active_user
from app.models.user import User
from app.routers.backup import _seed_defaults

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/claim")
async def claim_unclaimed_data(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    """Assign all rows with user_id=NULL to the current user.
    If no pre-existing data exists, seed defaults for a new user."""
    uid = user.id
    counts: dict[str, int] = {}
    for Model, label in [
        (IncomeExpenseGroup, "groups"),
        (Account, "accounts"),
        (MovementType, "types"),
        (Movement, "movements"),
        (InvestmentFund, "investment_funds"),
    ]:
        result = await db.execute(
            sa_update(Model).where(Model.user_id.is_(None)).values(user_id=uid).returning(Model.id)
        )
        counts[label] = len(result.fetchall())

    has_accounts = (await db.execute(select(Account.id).where(Account.user_id == uid).limit(1))).first()
    if not has_accounts:
        await _seed_defaults(db, uid)
        counts["seeded"] = True

    await db.commit()
    return {"claimed": counts}
