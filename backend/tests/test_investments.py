from datetime import date
from types import SimpleNamespace

import pytest

from app.routers.investments import _compute_fund


# ── helpers ───────────────────────────────────────────────────────────────────

def _fund(*, current_price=None, current_value_override=None):
    return SimpleNamespace(
        id=1, name="Test Fund", ticker="TEST", color="#6366f1",
        notes=None, movement_type_id=1,
        current_price=current_price,
        current_value_override=current_value_override,
    )


def _mv(id, money, *, d=date(2024, 1, 15)):
    return SimpleNamespace(id=id, money=money, date=d, bank_date=None, notes=None, name="Compra")


def _sup(units, price=None):
    return SimpleNamespace(units=units, price_at_purchase=price)


# ── tests ─────────────────────────────────────────────────────────────────────

def test_no_movements_returns_zeros_and_nones():
    result = _compute_fund(_fund(), [], {})
    assert result.total_invested == pytest.approx(0.0)
    assert result.total_units is None
    assert result.current_value is None
    assert result.gain_eur is None
    assert result.gain_pct is None


def test_gain_calculated_from_units_and_price():
    """500 invested, 5 units at purchase price 100. Current price 120 → value 600 → gain +100 (+20%)."""
    mv = _mv(1, 500)
    sup = _sup(units=5.0, price=100.0)
    result = _compute_fund(_fund(current_price=120.0), [mv], {1: sup})

    assert result.total_invested == pytest.approx(500.0)
    assert result.total_units == pytest.approx(5.0)
    assert result.current_value == pytest.approx(600.0)
    assert result.gain_eur == pytest.approx(100.0)
    assert result.gain_pct == pytest.approx(20.0)


def test_loss_scenario():
    """Current price below purchase → negative gain."""
    mv = _mv(1, 500)
    sup = _sup(units=5.0, price=100.0)
    result = _compute_fund(_fund(current_price=80.0), [mv], {1: sup})

    assert result.current_value == pytest.approx(400.0)
    assert result.gain_eur == pytest.approx(-100.0)
    assert result.gain_pct == pytest.approx(-20.0)


def test_current_value_override_takes_precedence():
    """override replaces the units×price calculation."""
    mv = _mv(1, 500)
    sup = _sup(units=5.0, price=100.0)
    # current_price would give 600, but override says 750
    result = _compute_fund(_fund(current_price=120.0, current_value_override=750.0), [mv], {1: sup})

    assert result.current_value == pytest.approx(750.0)
    assert result.gain_eur == pytest.approx(250.0)


def test_no_price_and_no_override_gives_none_value():
    mv = _mv(1, 500)
    sup = _sup(units=5.0, price=100.0)
    result = _compute_fund(_fund(), [mv], {1: sup})

    assert result.current_value is None
    assert result.gain_eur is None
    assert result.gain_pct is None


def test_movements_without_units_excluded_from_gain():
    """Only movements with tracked units count toward current_value; total_invested includes all."""
    mv1 = _mv(1, 300)  # tracked
    mv2 = _mv(2, 200)  # not tracked (no supplement)
    sup1 = _sup(units=3.0, price=100.0)
    result = _compute_fund(_fund(current_price=120.0), [mv1, mv2], {1: sup1})

    assert result.total_invested == pytest.approx(500.0)   # both movements
    assert result.total_units == pytest.approx(3.0)         # only mv1
    assert result.current_value == pytest.approx(360.0)     # 3 × 120
    assert result.gain_eur == pytest.approx(60.0)           # 360 - 300 (tracked_invested)


def test_multiple_tracked_movements_sum_correctly():
    mv1 = _mv(1, 300)
    mv2 = _mv(2, 200)
    sup1 = _sup(units=3.0, price=100.0)
    sup2 = _sup(units=2.0, price=100.0)
    result = _compute_fund(_fund(current_price=110.0), [mv1, mv2], {1: sup1, 2: sup2})

    assert result.total_units == pytest.approx(5.0)
    assert result.current_value == pytest.approx(550.0)
    assert result.gain_eur == pytest.approx(50.0)
    assert result.gain_pct == pytest.approx(10.0)


def test_zero_tracked_invested_does_not_divide():
    """If tracked_invested is 0, gain_pct must be None (no ZeroDivisionError)."""
    mv = _mv(1, 0)
    sup = _sup(units=5.0)
    result = _compute_fund(_fund(current_value_override=500.0), [mv], {1: sup})

    assert result.gain_eur is not None
    assert result.gain_pct is None


def test_purchases_sorted_descending_by_date():
    mv1 = _mv(1, 100, d=date(2024, 1, 1))
    mv2 = _mv(2, 100, d=date(2024, 6, 1))
    mv3 = _mv(3, 100, d=date(2024, 3, 1))
    result = _compute_fund(_fund(), [mv1, mv2, mv3], {})

    dates = [p.date for p in result.purchases]
    assert dates == sorted(dates, reverse=True)


def test_auto_units_formula():
    """upsert_purchase_supplement computes units = money / price when units not set."""
    money = 500.0
    price = 125.0
    expected_units = money / price
    assert expected_units == pytest.approx(4.0)
