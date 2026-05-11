from sqlalchemy import select

from app.models.account import Account
from app.models.income_expense_group import IncomeExpenseGroup
from app.models.investment import InvestmentFund, InvestmentPurchase
from app.models.movement import Movement
from app.models.movement_type import MovementType
from app.routers.backup import RestorePayload, restore_backup


# ── helpers ──────────────────────────────────────────────────────────────────

def _mv(id, name="Gasto", money=-100, type_id=None, account_id=None):
    return {
        "id": id, "name": name, "money": money,
        "date": "2024-01-15", "bank_date": None,
        "movement_type_id": type_id, "account_id": account_id,
        "paid": True, "no_count": False, "notes": None,
        "is_shared": False, "shared_between": None, "my_share": None,
    }


def _payload(db_data, **flags) -> RestorePayload:
    base = {
        "groups": [], "accounts": [], "types": [], "movements": [],
        "investment_funds": [], "investment_purchases": [],
        "templates": [], "preferences": {},
    }
    base.update(db_data)
    return RestorePayload(version="2", db=base, **flags)


# ── tests ─────────────────────────────────────────────────────────────────────

async def test_group_gets_new_id(db, user):
    """Restored group should receive a fresh DB-assigned ID, never the backup's."""
    payload = _payload(
        {"groups": [{"id": 999, "name": "Ingreso", "color": "#22c55e"}]},
        restore_groups=True,
    )
    await restore_backup(payload, db=db, user=user)

    groups = (await db.execute(
        select(IncomeExpenseGroup).where(IncomeExpenseGroup.user_id == user.id)
    )).scalars().all()

    assert len(groups) == 1
    assert groups[0].name == "Ingreso"
    assert groups[0].id != 999


async def test_type_group_fk_remapped(db, user):
    """MovementType.income_expense_group_id must point to the new group ID."""
    payload = _payload(
        {
            "groups": [{"id": 10, "name": "Gasto", "color": "#ef4444"}],
            "types": [{"id": 20, "name": "Supermercado", "category": "Vida Diaria",
                       "income_expense_group_id": 10, "linked_account_id": None}],
        },
        restore_groups=True, restore_types=True,
    )
    await restore_backup(payload, db=db, user=user)

    group = (await db.execute(
        select(IncomeExpenseGroup).where(IncomeExpenseGroup.user_id == user.id)
    )).scalar_one()
    typ = (await db.execute(
        select(MovementType).where(MovementType.user_id == user.id)
    )).scalar_one()

    assert typ.income_expense_group_id == group.id


async def test_type_linked_account_fk_remapped(db, user):
    """MovementType.linked_account_id must point to the new account ID."""
    payload = _payload(
        {
            "groups": [{"id": 1, "name": "Ahorro", "color": "#22c55e"}],
            "accounts": [{"id": 50, "name": "Cuenta ahorro", "color": "#22c55e",
                          "icon": "piggy-bank", "initial_balance": 0,
                          "sort_order": 1, "is_main": False}],
            "types": [{"id": 5, "name": "Ahorro", "category": "Ahorro",
                       "income_expense_group_id": 1, "linked_account_id": 50}],
        },
        restore_groups=True, restore_accounts=True, restore_types=True,
    )
    await restore_backup(payload, db=db, user=user)

    account = (await db.execute(
        select(Account).where(Account.user_id == user.id)
    )).scalar_one()
    typ = (await db.execute(
        select(MovementType).where(MovementType.user_id == user.id)
    )).scalar_one()

    assert typ.linked_account_id == account.id


async def test_movement_type_and_account_fk_remapped(db, user):
    """Movement.movement_type_id and account_id must both point to new IDs."""
    payload = _payload(
        {
            "groups": [{"id": 1, "name": "Ingreso", "color": "#22c55e"}],
            "accounts": [{"id": 7, "name": "Principal", "color": "#3b82f6",
                          "icon": "wallet", "initial_balance": 0,
                          "sort_order": 0, "is_main": True}],
            "types": [{"id": 3, "name": "Nómina", "category": "Ingreso",
                       "income_expense_group_id": 1, "linked_account_id": None}],
            "movements": [_mv(id=100, name="Sueldo", money=2000, type_id=3, account_id=7)],
        },
        restore_groups=True, restore_accounts=True,
        restore_types=True, restore_movements=True,
    )
    await restore_backup(payload, db=db, user=user)

    account = (await db.execute(
        select(Account).where(Account.user_id == user.id)
    )).scalar_one()
    typ = (await db.execute(
        select(MovementType).where(MovementType.user_id == user.id)
    )).scalar_one()
    mv = (await db.execute(
        select(Movement).where(Movement.user_id == user.id)
    )).scalar_one()

    assert mv.movement_type_id == typ.id
    assert mv.account_id == account.id


async def test_investment_purchase_movement_fk_remapped(db, user):
    """InvestmentPurchase.movement_id must point to the new movement ID."""
    payload = _payload(
        {
            "groups": [{"id": 1, "name": "Inversión", "color": "#6366f1"}],
            "types": [{"id": 2, "name": "Fondo", "category": "Ahorro",
                       "income_expense_group_id": 1, "linked_account_id": None}],
            "movements": [_mv(id=999, name="Compra VWCE", money=-500, type_id=2)],
            "investment_funds": [{"id": 1, "name": "VWCE", "ticker": "VWCE",
                                  "color": "#6366f1", "notes": None,
                                  "current_price": 100.0, "current_value_override": None,
                                  "movement_type_id": 2}],
            "investment_purchases": [{"id": 1, "movement_id": 999,
                                      "price_at_purchase": 100.0, "units": 5.0}],
        },
        restore_groups=True, restore_types=True,
        restore_movements=True, restore_investments=True,
    )
    await restore_backup(payload, db=db, user=user)

    mv = (await db.execute(
        select(Movement).where(Movement.user_id == user.id)
    )).scalar_one()
    purchase = (await db.execute(select(InvestmentPurchase))).scalar_one()

    assert purchase.movement_id == mv.id
    assert purchase.movement_id != 999


async def test_investment_fund_type_fk_remapped(db, user):
    """InvestmentFund.movement_type_id must point to the new type ID."""
    payload = _payload(
        {
            "groups": [{"id": 1, "name": "Inversión", "color": "#6366f1"}],
            "types": [{"id": 77, "name": "Fondo indexado", "category": "Ahorro",
                       "income_expense_group_id": 1, "linked_account_id": None}],
            "investment_funds": [{"id": 1, "name": "SP500", "ticker": "CSPX",
                                  "color": "#6366f1", "notes": None,
                                  "current_price": None, "current_value_override": None,
                                  "movement_type_id": 77}],
        },
        restore_groups=True, restore_types=True, restore_investments=True,
    )
    await restore_backup(payload, db=db, user=user)

    typ = (await db.execute(
        select(MovementType).where(MovementType.user_id == user.id)
    )).scalar_one()
    fund = (await db.execute(
        select(InvestmentFund).where(InvestmentFund.user_id == user.id)
    )).scalar_one()

    assert fund.movement_type_id == typ.id


async def test_multiple_groups_all_fks_correct(db, user):
    """N groups × N types: every type must point to the right group, no cross-contamination."""
    n = 5
    groups_data = [{"id": i * 100, "name": f"Grupo {i}", "color": "#000000"}
                   for i in range(1, n + 1)]
    types_data = [
        {"id": i * 100 + 50, "name": f"Tipo {i}", "category": "Vida Diaria",
         "income_expense_group_id": i * 100, "linked_account_id": None}
        for i in range(1, n + 1)
    ]
    payload = _payload(
        {"groups": groups_data, "types": types_data},
        restore_groups=True, restore_types=True,
    )
    await restore_backup(payload, db=db, user=user)

    groups = (await db.execute(
        select(IncomeExpenseGroup).where(IncomeExpenseGroup.user_id == user.id)
    )).scalars().all()
    types = (await db.execute(
        select(MovementType).where(MovementType.user_id == user.id)
    )).scalars().all()

    assert len(groups) == n
    assert len(types) == n

    new_group_ids = {g.id for g in groups}
    for t in types:
        assert t.income_expense_group_id in new_group_ids, (
            f"Type '{t.name}' FK {t.income_expense_group_id} "
            f"not in new group IDs {new_group_ids}"
        )
    # None of the original backup IDs (100, 200...) should appear
    backup_ids = {i * 100 for i in range(1, n + 1)}
    for t in types:
        assert t.income_expense_group_id not in backup_ids


async def test_restore_replaces_existing_data(db, user):
    """A second restore must delete previous data and insert fresh, not accumulate."""
    payload1 = _payload(
        {"groups": [{"id": 1, "name": "Ingreso", "color": "#22c55e"},
                    {"id": 2, "name": "Gasto", "color": "#ef4444"}]},
        restore_groups=True,
    )
    await restore_backup(payload1, db=db, user=user)

    after_first = (await db.execute(
        select(IncomeExpenseGroup).where(IncomeExpenseGroup.user_id == user.id)
    )).scalars().all()
    assert len(after_first) == 2

    payload2 = _payload(
        {"groups": [{"id": 99, "name": "Solo este", "color": "#000000"}]},
        restore_groups=True,
    )
    await restore_backup(payload2, db=db, user=user)

    after_second = (await db.execute(
        select(IncomeExpenseGroup).where(IncomeExpenseGroup.user_id == user.id)
    )).scalars().all()
    assert len(after_second) == 1
    assert after_second[0].name == "Solo este"
