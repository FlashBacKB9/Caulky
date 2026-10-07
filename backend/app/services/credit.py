"""Tarjetas de crédito: ciclos de facturación y liquidación mensual.

Cada compra con la tarjeta es un gasto normal en su fecha (account_id = tarjeta), así que la
tarjeta acumula deuda en negativo. El día de cargo, la cuenta pagadora salda el ciclo con un
traspaso hacia la tarjeta marcado con `credit_cycle_end`, que no cuenta como gasto.

Un ciclo va del día siguiente al corte anterior hasta el corte, ambos incluidos, y se cobra el
primer día de cargo posterior al corte. Con corte 25 y cargo 5, las compras del 26/09 al 25/10
se cobran el 05/11. `credit_last_cycle_end` marca hasta dónde está ya cobrado, de modo que un
cargo borrado a mano no se vuelve a generar.
"""
import calendar
import uuid
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.income_expense_group import IncomeExpenseGroup
from app.models.movement import Movement
from app.models.movement_type import MovementType
from app.services.audit import write_log

CREDIT_CATEGORY = "credito"
# Cota defensiva: una cuenta olvidada años no debe generar un bucle sin fin
_MAX_CYCLES = 600


def _on_day(year: int, month: int, day: int) -> date:
    """El día `day` de ese mes, o el último si el mes es más corto (corte 31 → 30/04)."""
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def _shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    idx = year * 12 + (month - 1) + delta
    return idx // 12, idx % 12 + 1


def first_on_or_after(d: date, day: int) -> date:
    """Primera fecha con ese día del mes que sea >= d."""
    cand = _on_day(d.year, d.month, day)
    if cand >= d:
        return cand
    y, m = _shift_month(d.year, d.month, 1)
    return _on_day(y, m, day)


def last_before(d: date, day: int) -> date:
    """Última fecha con ese día del mes que sea < d."""
    cand = _on_day(d.year, d.month, day)
    if cand < d:
        return cand
    y, m = _shift_month(d.year, d.month, -1)
    return _on_day(y, m, day)


def charge_date_for(cycle_end: date, charge_day: int) -> date:
    """El cargo cae el primer día de cargo estrictamente posterior al corte."""
    return first_on_or_after(cycle_end + timedelta(days=1), charge_day)


def initial_last_cycle_end(today: date, cutoff_day: int, charge_day: int) -> date:
    """
    Corte del último ciclo que ya se cobró antes de hoy. Al crear la tarjeta se supone que lo
    cobrado en el banco ya está registrado, y solo se generan los cargos de hoy en adelante.
    """
    ce = last_before(today + timedelta(days=1), cutoff_day)  # último corte <= hoy
    while charge_date_for(ce, charge_day) >= today:
        ce = last_before(ce, cutoff_day)
    return ce


def is_credit(acc: Account) -> bool:
    return (
        acc.category == CREDIT_CATEGORY
        and acc.credit_cutoff_day is not None
        and acc.credit_charge_day is not None
    )


@dataclass
class CreditCycle:
    account_id: int
    cycle_start: date   # primer día incluido
    cycle_end: date     # día de corte, incluido
    charge_date: date
    amount: float       # lo que se cobrará (positivo = deuda)
    pay_account_id: int | None
    closed: bool        # el corte ya pasó: el importe no cambia salvo que edites compras
    due: bool           # el día de cargo ya llegó


_dinero_expr = case(
    (Movement.money < 0, func.abs(Movement.money)),
    (IncomeExpenseGroup.name == "Ingreso", func.abs(Movement.money)),
    else_=-func.abs(Movement.money),
)


async def cycle_amount(db: AsyncSession, acc: Account, after: date, until: date) -> float:
    """Deuda generada por las compras con fecha en (after, until]. Las devoluciones restan."""
    res = await db.execute(
        select(func.coalesce(func.sum(_dinero_expr), 0))
        .where(
            Movement.user_id == acc.user_id,
            Movement.account_id == acc.id,
            Movement.is_transfer == False,  # noqa: E712
            Movement.no_count == False,  # noqa: E712
            Movement.date > after,
            Movement.date <= until,
        )
        .outerjoin(MovementType, Movement.movement_type_id == MovementType.id)
        .outerjoin(IncomeExpenseGroup, MovementType.income_expense_group_id == IncomeExpenseGroup.id)
    )
    return round(-float(res.scalar() or 0), 2)


async def _main_account_id(db: AsyncSession, user_id: uuid.UUID) -> int | None:
    res = await db.execute(
        select(Account.id).where(Account.user_id == user_id, Account.is_main == True)  # noqa: E712
    )
    return res.scalars().first()


async def pending_cycles(db: AsyncSession, acc: Account, today: date) -> list[CreditCycle]:
    """
    Ciclos aún sin cobrar, en orden: los vencidos (si el cargo no es automático), el cerrado
    que espera su día de cargo y el que está en curso.
    """
    if not is_credit(acc):
        return []
    ensure_last_cycle_end(acc, today)
    last = acc.credit_last_cycle_end
    pay_id = acc.credit_pay_account_id or await _main_account_id(db, acc.user_id)
    out: list[CreditCycle] = []
    for _ in range(_MAX_CYCLES):
        ce = first_on_or_after(last + timedelta(days=1), acc.credit_cutoff_day)
        ch = charge_date_for(ce, acc.credit_charge_day)
        out.append(CreditCycle(
            account_id=acc.id,
            cycle_start=last + timedelta(days=1),
            cycle_end=ce,
            charge_date=ch,
            amount=await cycle_amount(db, acc, last, ce),
            pay_account_id=pay_id,
            closed=ce < today,
            due=ch <= today,
        ))
        if ce >= today:
            break
        last = ce
    return out


async def create_charge(db: AsyncSession, acc: Account, cycle: CreditCycle, amount: float) -> Movement | None:
    """Registra el cargo del ciclo y lo marca como cobrado. Sin importe no crea movimiento."""
    mv = None
    if amount > 0 and cycle.pay_account_id is not None:
        mv = Movement(
            name=f"Liquidación {acc.name}",
            money=amount,
            date=cycle.charge_date,
            bank_date=cycle.charge_date,
            paid=True,
            no_count=False,
            is_transfer=True,
            account_id=acc.id,
            from_account_id=cycle.pay_account_id,
            credit_cycle_end=cycle.cycle_end,
            credit_cycle_start=cycle.cycle_start,
            notes=f"Compras del {cycle.cycle_start:%d/%m/%Y} al {cycle.cycle_end:%d/%m/%Y}",
            user_id=acc.user_id,
        )
        db.add(mv)
    acc.credit_last_cycle_end = cycle.cycle_end
    return mv


async def settlement_items(db: AsyncSession, settlement: Movement) -> list[Movement]:
    """Compras que cobra una liquidación: las de la tarjeta con fecha dentro de su ciclo."""
    acc = await db.get(Account, settlement.account_id)
    if acc is None or settlement.credit_cycle_end is None:
        return []
    start = settlement.credit_cycle_start
    if start is None:
        # Liquidaciones anteriores a credit_cycle_start: el ciclo empieza tras el corte previo
        cutoff_day = acc.credit_cutoff_day or settlement.credit_cycle_end.day
        start = last_before(settlement.credit_cycle_end, cutoff_day) + timedelta(days=1)
    res = await db.execute(
        select(Movement).where(
            Movement.user_id == settlement.user_id,
            Movement.account_id == acc.id,
            Movement.is_transfer == False,  # noqa: E712
            Movement.no_count == False,  # noqa: E712
            Movement.date >= start,
            Movement.date <= settlement.credit_cycle_end,
        ).order_by(Movement.date, Movement.id)
    )
    return list(res.scalars().all())


async def settlement_for(db: AsyncSession, mv: Movement) -> Movement | None:
    """Liquidación que cobró una compra con tarjeta, si ya se registró."""
    if mv.account_id is None or mv.is_transfer or mv.credit_cycle_end is not None:
        return None
    acc = await db.get(Account, mv.account_id)
    if acc is None or acc.category != CREDIT_CATEGORY:
        return None
    res = await db.execute(
        select(Movement).where(
            Movement.user_id == mv.user_id,
            Movement.account_id == acc.id,
            Movement.credit_cycle_end.is_not(None),
            Movement.credit_cycle_end >= mv.date,
        ).order_by(Movement.credit_cycle_end).limit(1)
    )
    settlement = res.scalar_one_or_none()
    if settlement is None:
        return None
    if settlement.credit_cycle_start is not None and settlement.credit_cycle_start > mv.date:
        return None
    return settlement


async def sync_credit_charges(db: AsyncSession, user_id: uuid.UUID, today: date | None = None) -> int:
    """
    Crea los cargos automáticos cuyo día ya llegó. Idempotente: se llama al listar cuentas y
    movimientos, igual que las plantillas automáticas se crean al abrir la app.
    """
    today = today or date.today()
    res = await db.execute(
        select(Account).where(
            Account.user_id == user_id,
            Account.category == CREDIT_CATEGORY,
            Account.credit_auto_charge == True,  # noqa: E712
        )
    )
    created = 0
    changed = False
    for acc in res.scalars().all():
        if not is_credit(acc):
            continue
        if acc.credit_last_cycle_end is None:
            ensure_last_cycle_end(acc, today)
            changed = True
        for cycle in await pending_cycles(db, acc, today):
            if not cycle.due:
                break
            changed = True
            mv = await create_charge(db, acc, cycle, cycle.amount)
            if mv is not None:
                await db.flush()
                await write_log(user_id, "movement", mv.id, "create",
                                f"Liquidación automática de tarjeta: {acc.name} {cycle.amount:.2f}€ ({mv.date})")
                created += 1
    if changed:
        await db.commit()
    return created


def ensure_last_cycle_end(acc: Account, today: date | None = None) -> None:
    """Fija el punto de partida de una tarjeta nueva (o recién configurada) si no lo tiene."""
    if is_credit(acc) and acc.credit_last_cycle_end is None:
        acc.credit_last_cycle_end = initial_last_cycle_end(
            today or date.today(), acc.credit_cutoff_day, acc.credit_charge_day)
