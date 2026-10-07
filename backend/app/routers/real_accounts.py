from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete as sa_delete, func
from sqlalchemy.orm import selectinload
from sqlalchemy.orm import attributes as sa_attrs
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.real_account import RealAccount, real_account_accounts
from app.models.account import Account
from app.schemas.real_account import RealAccountRead, RealAccountCreate, RealAccountPatch
from app.services.credit import CREDIT_CATEGORY
from app.auth.setup import current_active_user
from app.models.user import User

router = APIRouter(prefix="/real-accounts", tags=["real-accounts"])


def _to_read(ra: RealAccount, cards: dict[int, list[int]] | None = None) -> RealAccountRead:
    return RealAccountRead(
        id=ra.id,
        name=ra.name,
        entity_name=ra.entity_name,
        account_number=ra.account_number,
        color=ra.color,
        linked_account_ids=[a.id for a in ra.linked_accounts],
        card_account_ids=(cards or {}).get(ra.id, []),
    )


async def _cards_by_real_account(db: AsyncSession, user: User) -> dict[int, list[int]]:
    """
    Cada tarjeta de crédito cuelga de la cuenta real que contiene su cuenta pagadora (la
    principal si no tiene). Si la tarjeta ya está vinculada a mano a alguna, manda eso.
    """
    links = (await db.execute(
        select(real_account_accounts.c.real_account_id, real_account_accounts.c.account_id)
        .join(RealAccount, RealAccount.id == real_account_accounts.c.real_account_id)
        .where(RealAccount.user_id == user.id)
        .order_by(real_account_accounts.c.real_account_id)
    )).all()
    owner: dict[int, int] = {}
    for ra_id, acc_id in links:
        owner.setdefault(acc_id, ra_id)
    accounts = (await db.execute(select(Account).where(Account.user_id == user.id))).scalars().all()
    main_id = next((a.id for a in accounts if a.is_main), None)
    out: dict[int, list[int]] = {}
    for a in accounts:
        if a.category != CREDIT_CATEGORY or a.id in owner:
            continue
        ra_id = owner.get(a.credit_pay_account_id or main_id)
        if ra_id is not None:
            out.setdefault(ra_id, []).append(a.id)
    return out


async def _detach_from_others(db: AsyncSession, user: User, account_ids: list[int], keep_ra_id: int) -> None:
    """Una cuenta ficticia cuelga de una sola cuenta real: al vincularla aquí se suelta de las demás."""
    if not account_ids:
        return
    user_ra_ids = select(RealAccount.id).where(RealAccount.user_id == user.id, RealAccount.id != keep_ra_id)
    await db.execute(
        sa_delete(real_account_accounts).where(
            real_account_accounts.c.account_id.in_(account_ids),
            real_account_accounts.c.real_account_id.in_(user_ra_ids),
        )
    )


def _implicit_account(ra: RealAccount) -> Account | None:
    """La ficticia "invisible": única vinculada y con el mismo nombre que la cuenta real."""
    if len(ra.linked_accounts) == 1 and ra.linked_accounts[0].name == ra.name:
        return ra.linked_accounts[0]
    return None


@router.get("", response_model=list[RealAccountRead])
async def list_real_accounts(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(RealAccount).where(RealAccount.user_id == user.id).order_by(RealAccount.id)
    )
    cards = await _cards_by_real_account(db, user)
    return [_to_read(ra, cards) for ra in result.scalars().all()]


async def _get_with_links(db: AsyncSession, ra_id: int) -> RealAccount | None:
    result = await db.execute(
        select(RealAccount).where(RealAccount.id == ra_id)
        .options(selectinload(RealAccount.linked_accounts))
    )
    return result.scalar_one_or_none()


@router.post("", response_model=RealAccountRead, status_code=201)
async def create_real_account(
    body: RealAccountCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    ra = RealAccount(
        name=body.name,
        entity_name=body.entity_name,
        account_number=body.account_number,
        color=body.color,
        user_id=user.id,
    )
    db.add(ra)
    await db.flush()
    # Vínculos huérfanos de una cuenta real borrada con el mismo ID (SQLite reutiliza IDs)
    await db.execute(sa_delete(real_account_accounts).where(real_account_accounts.c.real_account_id == ra.id))
    # Inform SQLAlchemy the committed value is [] so it won't lazy-load async
    sa_attrs.set_committed_value(ra, 'linked_accounts', [])
    accs = []
    if body.linked_account_ids:
        accs = list((await db.execute(
            select(Account).where(Account.id.in_(body.linked_account_ids), Account.user_id == user.id)
        )).scalars().all())
    if not accs:
        # Sin ficticias: se crea una con el mismo nombre, que Configuración no muestra
        max_order = (await db.execute(
            select(func.max(Account.sort_order)).where(Account.user_id == user.id)
        )).scalar() or 0
        acc = Account(
            name=body.name, color=body.color, icon="landmark", category="corriente",
            initial_balance=body.initial_balance, sort_order=max_order + 1,
            is_main=False, user_id=user.id,
        )
        db.add(acc)
        await db.flush()
        accs = [acc]
    await _detach_from_others(db, user, [a.id for a in accs], ra.id)
    ra.linked_accounts = accs
    await db.commit()
    return _to_read(await _get_with_links(db, ra.id), await _cards_by_real_account(db, user))


@router.put("/{ra_id}", response_model=RealAccountRead)
async def update_real_account(
    ra_id: int,
    body: RealAccountPatch,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    ra = await _get_with_links(db, ra_id)
    if not ra or ra.user_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    implicit = _implicit_account(ra)
    if implicit is not None and body.linked_account_ids in (None, [implicit.id]):
        # La ficticia invisible sigue el nombre y color de su cuenta real
        if body.name is not None:
            implicit.name = body.name
        if body.color is not None:
            implicit.color = body.color
    if body.name is not None:
        ra.name = body.name
    if body.entity_name is not None:
        ra.entity_name = body.entity_name
    if body.account_number is not None:
        ra.account_number = body.account_number
    if body.color is not None:
        ra.color = body.color
    if body.linked_account_ids is not None:
        accs = (await db.execute(
            select(Account).where(Account.id.in_(body.linked_account_ids), Account.user_id == user.id)
        )).scalars().all()
        await _detach_from_others(db, user, [a.id for a in accs], ra.id)
        ra.linked_accounts = list(accs)
    await db.commit()
    return _to_read(await _get_with_links(db, ra_id), await _cards_by_real_account(db, user))


@router.delete("/{ra_id}", status_code=204)
async def delete_real_account(
    ra_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    ra = await db.get(RealAccount, ra_id)
    if not ra or ra.user_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(ra)
    await db.commit()
