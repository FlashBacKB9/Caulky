from sqlalchemy import select

from app.models.account import Account
from app.models.real_account import RealAccount, real_account_accounts
from app.routers.accounts import delete_account
from app.routers.backup import RestorePayload, export_backup, restore_backup
from app.routers.real_accounts import create_real_account, update_real_account
from app.schemas.real_account import RealAccountCreate, RealAccountPatch


async def _account(db, user, name, **kw):
    acc = Account(name=name, user_id=user.id, **kw)
    db.add(acc)
    await db.commit()
    return acc


async def _links(db):
    rows = (await db.execute(select(real_account_accounts))).all()
    return {(r.real_account_id, r.account_id) for r in rows}


async def test_create_without_links_creates_hidden_account(db, user):
    ra = await create_real_account(
        RealAccountCreate(name="Cuenta Nómina", entity_name="ING", color="#f97316", initial_balance=250),
        db=db, user=user,
    )
    accs = (await db.execute(select(Account).where(Account.user_id == user.id))).scalars().all()
    assert len(accs) == 1
    assert accs[0].name == "Cuenta Nómina"
    assert accs[0].color == "#f97316"
    assert float(accs[0].initial_balance) == 250
    assert ra.linked_account_ids == [accs[0].id]


async def test_create_with_links_does_not_create_account(db, user):
    acc = await _account(db, user, "De Uso")
    ra = await create_real_account(
        RealAccountCreate(name="Nómina", entity_name="ING", linked_account_ids=[acc.id]),
        db=db, user=user,
    )
    count = len((await db.execute(select(Account).where(Account.user_id == user.id))).scalars().all())
    assert count == 1
    assert ra.linked_account_ids == [acc.id]


async def test_rename_syncs_hidden_account(db, user):
    ra = await create_real_account(RealAccountCreate(name="Openbank", entity_name="Openbank"), db=db, user=user)
    await update_real_account(ra.id, RealAccountPatch(name="CTA OPEN", color="#ef4444"), db=db, user=user)
    acc = await db.get(Account, ra.linked_account_ids[0])
    await db.refresh(acc)
    assert acc.name == "CTA OPEN"
    assert acc.color == "#ef4444"


async def test_rename_leaves_named_accounts_alone(db, user):
    acc = await _account(db, user, "De Uso")
    ra = await create_real_account(
        RealAccountCreate(name="Nómina", entity_name="ING", linked_account_ids=[acc.id]), db=db, user=user,
    )
    await update_real_account(ra.id, RealAccountPatch(name="Nómina ING"), db=db, user=user)
    await db.refresh(acc)
    assert acc.name == "De Uso"


async def test_account_belongs_to_one_real_account(db, user):
    acc = await _account(db, user, "Ahorro")
    first = await create_real_account(
        RealAccountCreate(name="A", entity_name="X", linked_account_ids=[acc.id]), db=db, user=user,
    )
    second = await create_real_account(
        RealAccountCreate(name="B", entity_name="Y", linked_account_ids=[acc.id]), db=db, user=user,
    )
    assert await _links(db) == {(second.id, acc.id)}
    # Y al revés, moviéndola con un update
    await update_real_account(first.id, RealAccountPatch(linked_account_ids=[acc.id]), db=db, user=user)
    assert await _links(db) == {(first.id, acc.id)}


async def test_delete_account_removes_link(db, user):
    acc = await _account(db, user, "Hucha")
    await create_real_account(
        RealAccountCreate(name="A", entity_name="X", linked_account_ids=[acc.id]), db=db, user=user,
    )
    await delete_account(acc.id, delete_movements=False, convert_to_expense=False, db=db, user=user)
    assert await _links(db) == set()


async def test_backup_roundtrip_keeps_real_accounts(db, user):
    a1 = await _account(db, user, "De Uso", is_main=True)
    a2 = await _account(db, user, "Gastos Anuales")
    loose = await _account(db, user, "Coche", category="vehiculo")
    await create_real_account(
        RealAccountCreate(name="Nómina", entity_name="ING", account_number="ES12", linked_account_ids=[a1.id, a2.id]),
        db=db, user=user,
    )
    backup = await export_backup(db=db, user=user)
    assert backup["db"]["real_accounts"][0]["linked_account_ids"] == [a1.id, a2.id]

    await restore_backup(RestorePayload(version="2", db=backup["db"], restore_accounts=True), db=db, user=user)

    ras = (await db.execute(select(RealAccount).where(RealAccount.user_id == user.id))).scalars().all()
    assert len(ras) == 1
    assert ras[0].account_number == "ES12"
    accs = {a.id: a.name for a in (await db.execute(select(Account).where(Account.user_id == user.id))).scalars().all()}
    linked = sorted(accs[aid] for _, aid in await _links(db))
    assert linked == ["De Uso", "Gastos Anuales"]
    assert "Coche" in accs.values() and loose.id not in [aid for _, aid in await _links(db)]


async def test_restore_old_backup_without_real_accounts(db, user):
    payload = RestorePayload(version="2", db={"accounts": [{"id": 1, "name": "De Uso", "is_main": True}]},
                             restore_accounts=True)
    await restore_backup(payload, db=db, user=user)
    assert (await db.execute(select(RealAccount))).scalars().all() == []


async def test_orphan_links_do_not_break_new_ids(db, user):
    """SQLite no borra vínculos en cascada: un vínculo huérfano no debe colgar cuentas nuevas."""
    await db.execute(real_account_accounts.insert(), [{"real_account_id": 1, "account_id": 1}])
    await db.commit()
    acc = await _account(db, user, "Otra")
    assert acc.id == 1
    ra = await create_real_account(RealAccountCreate(name="Nueva", entity_name="X"), db=db, user=user)
    assert ra.id == 1
    assert len(ra.linked_account_ids) == 1 and ra.linked_account_ids != [acc.id]


async def test_credit_card_hangs_from_paying_real_account(db, user):
    from app.routers.real_accounts import list_real_accounts

    main = await _account(db, user, "De Uso", is_main=True)
    savings = await _account(db, user, "Ahorro", category="ahorro")
    visa = await _account(db, user, "Visa", category="credito", credit_cutoff_day=31, credit_charge_day=5)
    amex = await _account(db, user, "Amex", category="credito", credit_cutoff_day=31, credit_charge_day=5,
                          credit_pay_account_id=savings.id)
    ing = await create_real_account(RealAccountCreate(name="ING", entity_name="ING", linked_account_ids=[main.id]), db=db, user=user)
    tr = await create_real_account(RealAccountCreate(name="TR", entity_name="TR", linked_account_ids=[savings.id]), db=db, user=user)

    # Sin cuenta pagadora, la Visa la paga la principal; la Amex, la de ahorro
    assert ing.card_account_ids == [visa.id]  # la respuesta al crear ya la incluye
    by_id = {ra.id: ra for ra in await list_real_accounts(db=db, user=user)}
    assert by_id[ing.id].card_account_ids == [visa.id]
    assert by_id[tr.id].card_account_ids == [amex.id]
    assert visa.id not in by_id[ing.id].linked_account_ids  # no se guarda como vínculo

    # Vinculada a mano a otra cuenta real, manda el vínculo
    await update_real_account(tr.id, RealAccountPatch(linked_account_ids=[savings.id, visa.id]), db=db, user=user)
    by_id = {ra.id: ra for ra in await list_real_accounts(db=db, user=user)}
    assert by_id[ing.id].card_account_ids == []
    assert visa.id in by_id[tr.id].linked_account_ids
