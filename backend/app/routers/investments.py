from datetime import date as date_type, datetime, timezone
from sqlalchemy import or_
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from app.database import get_db
from app.models.investment import InvestmentFund, InvestmentPurchase
from app.models.movement import Movement
from app.schemas.investment import (
    FundCreate, FundPatch, FundRead, PurchasePatch, PurchaseRead,
)
from app.services.audit import write_log
from app.auth.setup import current_active_user
from app.models.user import User

router = APIRouter(prefix="/investments", tags=["investments"])

YAHOO_HEADERS = {"User-Agent": "Mozilla/5.0"}


def _compute_fund(fund: InvestmentFund, movements: list, supplements: dict) -> FundRead:
    total_invested = sum(float(m.money) for m in movements)

    tracked = [
        (m, supplements[m.id])
        for m in movements
        if supplements.get(m.id) is not None and supplements[m.id].units is not None
    ]
    total_units = sum(float(s.units) for _, s in tracked) if tracked else None
    tracked_invested = sum(float(m.money) for m, _ in tracked) if tracked else 0

    current_price = float(fund.current_price) if fund.current_price is not None else None

    if fund.current_value_override is not None:
        current_value = float(fund.current_value_override)
    elif total_units is not None and current_price is not None:
        current_value = total_units * current_price
    else:
        current_value = None

    gain_eur = (current_value - tracked_invested) if current_value is not None else None
    gain_pct = (
        gain_eur / tracked_invested * 100
        if gain_eur is not None and tracked_invested > 0
        else None
    )

    purchases_out = []
    for m in sorted(movements, key=lambda m: m.date, reverse=True):
        sup = supplements.get(m.id)
        purchases_out.append(PurchaseRead(
            movement_id=m.id,
            date=m.date,
            bank_date=m.bank_date,
            amount_eur=float(m.money),
            notes=m.notes or m.name,
            price_at_purchase=float(sup.price_at_purchase) if sup and sup.price_at_purchase is not None else None,
            units=float(sup.units) if sup and sup.units is not None else None,
        ))

    return FundRead(
        id=fund.id,
        name=fund.name,
        ticker=fund.ticker,
        color=fund.color,
        notes=fund.notes,
        movement_type_id=fund.movement_type_id,
        current_price=current_price,
        current_value_override=float(fund.current_value_override) if fund.current_value_override is not None else None,
        total_invested=total_invested,
        total_units=total_units,
        current_value=current_value,
        gain_eur=gain_eur,
        gain_pct=gain_pct,
        purchases=purchases_out,
    )


async def _load_all_funds(db: AsyncSession, user_id) -> list[FundRead]:
    funds_res = await db.execute(
        select(InvestmentFund).where(InvestmentFund.user_id == user_id).order_by(InvestmentFund.id)
    )
    funds = funds_res.scalars().all()

    type_ids = [f.movement_type_id for f in funds if f.movement_type_id is not None]

    movements_by_type: dict[int, list] = {}
    all_movement_ids: list[int] = []
    if type_ids:
        today = date_type.today()
        mov_res = await db.execute(
            select(Movement)
            .where(
                Movement.movement_type_id.in_(type_ids),
                Movement.user_id == user_id,
                Movement.paid == True,
                Movement.no_count == False,
                or_(Movement.bank_date.is_(None), Movement.bank_date <= today),
            )
            .order_by(Movement.date.desc())
        )
        for m in mov_res.scalars().all():
            movements_by_type.setdefault(m.movement_type_id, []).append(m)
            all_movement_ids.append(m.id)

    supplements: dict[int, InvestmentPurchase] = {}
    if all_movement_ids:
        sup_res = await db.execute(
            select(InvestmentPurchase).where(InvestmentPurchase.movement_id.in_(all_movement_ids))
        )
        for s in sup_res.scalars().all():
            supplements[s.movement_id] = s

    return [
        _compute_fund(f, movements_by_type.get(f.movement_type_id, []), supplements)
        for f in funds
    ]


async def _yahoo_current(ticker: str) -> float:
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1d"
    async with httpx.AsyncClient(timeout=8) as client:
        r = await client.get(url, headers=YAHOO_HEADERS)
        r.raise_for_status()
        data = r.json()
    result = data["chart"]["result"]
    if not result:
        raise ValueError("Sin datos")
    return float(result[0]["meta"]["regularMarketPrice"])


async def _yahoo_historical(ticker: str, on_date: date_type) -> float:
    ts = int(datetime(on_date.year, on_date.month, on_date.day, tzinfo=timezone.utc).timestamp())
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
        f"?interval=1d&period1={ts}&period2={ts + 7 * 86400}"
    )
    async with httpx.AsyncClient(timeout=8) as client:
        r = await client.get(url, headers=YAHOO_HEADERS)
        r.raise_for_status()
        data = r.json()
    result = data["chart"]["result"]
    if not result:
        raise ValueError("Sin datos")
    closes = result[0]["indicators"]["quote"][0].get("close", [])
    closes = [c for c in closes if c is not None]
    if not closes:
        raise ValueError("Sin precios para esa fecha")
    return float(closes[0])


@router.get("/funds", response_model=list[FundRead])
async def list_funds(db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    return await _load_all_funds(db, user.id)


def _fund_snap(f: InvestmentFund) -> dict:
    return {
        "name": f.name, "ticker": f.ticker, "color": f.color,
        "current_price": float(f.current_price) if f.current_price is not None else None,
        "current_value_override": float(f.current_value_override) if f.current_value_override is not None else None,
    }


@router.post("/funds", response_model=FundRead, status_code=201)
async def create_fund(body: FundCreate, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    fund = InvestmentFund(**body.model_dump(), user_id=user.id)
    db.add(fund)
    await db.flush()
    write_log(db, user.id, "fund", fund.id, "create",
              f"Fondo creado: {fund.name}" + (f" ({fund.ticker})" if fund.ticker else ""),
              after=_fund_snap(fund))
    await db.commit()
    await db.refresh(fund)
    return _compute_fund(fund, [], {})


@router.put("/funds/{fund_id}", response_model=FundRead)
async def update_fund(fund_id: int, body: FundPatch, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    fund = await db.get(InvestmentFund, fund_id)
    if not fund or fund.user_id != user.id:
        raise HTTPException(404, "Fondo no encontrado")
    changes = body.model_dump(exclude_unset=True)
    before = {k: _fund_snap(fund)[k] for k in changes if k in _fund_snap(fund)}
    for k, v in changes.items():
        setattr(fund, k, v)
    write_log(db, user.id, "fund", fund.id, "update",
              f"Fondo editado: {fund.name}",
              before=before, after={k: _fund_snap(fund)[k] for k in changes if k in _fund_snap(fund)})
    await db.commit()
    all_funds = await _load_all_funds(db, user.id)
    return next(f for f in all_funds if f.id == fund_id)


@router.delete("/funds/{fund_id}", status_code=204)
async def delete_fund(fund_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    fund = await db.get(InvestmentFund, fund_id)
    if not fund or fund.user_id != user.id:
        raise HTTPException(404, "Fondo no encontrado")
    write_log(db, user.id, "fund", fund.id, "delete",
              f"Fondo eliminado: {fund.name}",
              before=_fund_snap(fund))
    await db.delete(fund)
    await db.commit()


@router.post("/funds/{fund_id}/fetch-price", response_model=FundRead)
async def fetch_current_price(fund_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    fund = await db.get(InvestmentFund, fund_id)
    if not fund or fund.user_id != user.id:
        raise HTTPException(404, "Fondo no encontrado")
    if not fund.ticker:
        raise HTTPException(400, "El fondo no tiene ticker configurado")
    try:
        price = await _yahoo_current(fund.ticker)
    except Exception as e:
        raise HTTPException(502, f"Error al obtener precio: {e}")
    fund.current_price = price  # type: ignore[assignment]
    await db.commit()
    all_funds = await _load_all_funds(db, user.id)
    return next(f for f in all_funds if f.id == fund_id)


def _purchase_read(movement: Movement, sup: InvestmentPurchase | None) -> PurchaseRead:
    return PurchaseRead(
        movement_id=movement.id,
        date=movement.date,
        bank_date=movement.bank_date,
        amount_eur=float(movement.money),
        notes=movement.notes or movement.name,
        price_at_purchase=float(sup.price_at_purchase) if sup and sup.price_at_purchase is not None else None,
        units=float(sup.units) if sup and sup.units is not None else None,
    )


@router.put("/purchases/{movement_id}", response_model=PurchaseRead)
async def upsert_purchase_supplement(movement_id: int, body: PurchasePatch, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    movement = await db.get(Movement, movement_id)
    if not movement or movement.user_id != user.id:
        raise HTTPException(404, "Movimiento no encontrado")

    sup_res = await db.execute(
        select(InvestmentPurchase).where(InvestmentPurchase.movement_id == movement_id)
    )
    sup = sup_res.scalar_one_or_none()
    if sup is None:
        sup = InvestmentPurchase(movement_id=movement_id)
        db.add(sup)

    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(sup, k, v)

    if sup.price_at_purchase and not sup.units:
        sup.units = float(movement.money) / float(sup.price_at_purchase)  # type: ignore

    units_str = f"{float(sup.units):.4g} uds" if sup.units else ""
    price_str = f"@ {float(sup.price_at_purchase):.2f}€" if sup.price_at_purchase else ""
    write_log(db, user.id, "purchase", movement_id, "update",
              f"Compra actualizada: {movement.name} {units_str} {price_str}".strip(),
              after={"units": float(sup.units) if sup.units else None,
                     "price_at_purchase": float(sup.price_at_purchase) if sup.price_at_purchase else None})
    await db.commit()
    await db.refresh(sup)
    return _purchase_read(movement, sup)


@router.delete("/purchases/{movement_id}", status_code=204)
async def delete_purchase_supplement(movement_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    movement = await db.get(Movement, movement_id)
    if not movement or movement.user_id != user.id:
        raise HTTPException(404, "Movimiento no encontrado")
    sup_res = await db.execute(
        select(InvestmentPurchase).where(InvestmentPurchase.movement_id == movement_id)
    )
    sup = sup_res.scalar_one_or_none()
    if sup:
        write_log(db, user.id, "purchase", movement_id, "delete",
                  f"Compra eliminada: {movement.name}",
                  before={"units": float(sup.units) if sup.units else None,
                          "price_at_purchase": float(sup.price_at_purchase) if sup.price_at_purchase else None})
        await db.delete(sup)
        await db.commit()


@router.post("/purchases/{movement_id}/fetch-price", response_model=PurchaseRead)
async def fetch_purchase_price(movement_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    movement = await db.get(Movement, movement_id)
    if not movement or movement.user_id != user.id:
        raise HTTPException(404, "Movimiento no encontrado")

    fund_res = await db.execute(
        select(InvestmentFund).where(InvestmentFund.movement_type_id == movement.movement_type_id)
    )
    fund = fund_res.scalar_one_or_none()
    if not fund or not fund.ticker:
        raise HTTPException(400, "El fondo no tiene ticker configurado")

    try:
        price = await _yahoo_historical(fund.ticker, movement.bank_date or movement.date)
    except Exception as e:
        raise HTTPException(502, f"Error al obtener precio histórico: {e}")

    sup_res = await db.execute(
        select(InvestmentPurchase).where(InvestmentPurchase.movement_id == movement_id)
    )
    sup = sup_res.scalar_one_or_none()
    if sup is None:
        sup = InvestmentPurchase(movement_id=movement_id)
        db.add(sup)

    sup.price_at_purchase = price  # type: ignore
    sup.units = float(movement.money) / price  # type: ignore
    await db.commit()
    await db.refresh(sup)
    return _purchase_read(movement, sup)


@router.get("/summary")
async def get_summary(db: AsyncSession = Depends(get_db), user: User = Depends(current_active_user)):
    funds = await _load_all_funds(db, user.id)
    total_invested = sum(f.total_invested for f in funds)
    has_value = any(f.current_value is not None for f in funds)
    total_current = sum(f.current_value for f in funds if f.current_value is not None)
    return {
        "total_invested": total_invested,
        "total_current_value": total_current if has_value else None,
        "gain_eur": (total_current - total_invested) if has_value else None,
        "gain_pct": (
            (total_current - total_invested) / total_invested * 100
            if has_value and total_invested > 0
            else None
        ),
    }
