import pytest
from types import SimpleNamespace

from app.routers.stats import _effective_money


def _mv(money, *, is_shared=False, shared_between=None, my_share=None):
    return SimpleNamespace(
        money=money,
        is_shared=is_shared,
        shared_between=shared_between,
        my_share=my_share,
    )


@pytest.mark.parametrize("money,expected", [
    (100,  100.0),
    (-50,  -50.0),
    (0,      0.0),
])
def test_not_shared_returns_full_amount(money, expected):
    assert _effective_money(_mv(money, is_shared=False)) == pytest.approx(expected)


@pytest.mark.parametrize("money,between,expected", [
    (100, 2,  50.0),
    (90,  3,  30.0),
    (75,  4,  18.75),
])
def test_shared_between_divides_equally(money, between, expected):
    assert _effective_money(_mv(money, is_shared=True, shared_between=between)) == pytest.approx(expected)


def test_my_share_positive_money():
    """my_share replaces the amount when money is positive."""
    assert _effective_money(_mv(200, is_shared=True, my_share=35.0)) == pytest.approx(35.0)


def test_my_share_negative_money():
    """my_share keeps the sign of money when money is negative (refund)."""
    assert _effective_money(_mv(-200, is_shared=True, my_share=35.0)) == pytest.approx(-35.0)


def test_shared_between_one_falls_through_to_my_share():
    """shared_between=1 is not > 1, so my_share branch is used instead."""
    assert _effective_money(_mv(100, is_shared=True, shared_between=1, my_share=40.0)) == pytest.approx(40.0)


def test_shared_no_split_info_returns_full_amount():
    """is_shared=True but no shared_between and no my_share → full amount (fallback)."""
    assert _effective_money(_mv(100, is_shared=True)) == pytest.approx(100.0)
