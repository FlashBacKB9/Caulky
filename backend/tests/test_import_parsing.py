from datetime import date

import pytest

from app.routers.import_excel import _parse_money, _parse_date


# ── _parse_money ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("s, expected", [
    ("100",        100.0),
    ("1.234,56",  1234.56),   # EU: punto=miles, coma=decimal
    ("1,234.56",  1234.56),   # US: coma=miles, punto=decimal
    ("1,50",         1.50),   # EU solo coma
    ("-50,50",      -50.50),  # negativo EU
    ("100€",        100.0),   # símbolo euro
    ("$100",        100.0),   # símbolo dólar
    ("+100",        100.0),   # signo más
    (" 50 ",         50.0),   # espacios
    ("0,00",          0.0),   # cero EU
    ("-1.000,00",  -1000.0),  # negativo EU con miles
])
def test_parse_money(s, expected):
    assert _parse_money(s) == pytest.approx(expected)


def test_parse_money_empty_raises():
    with pytest.raises(ValueError, match="vacío"):
        _parse_money("")


def test_parse_money_whitespace_only_raises():
    with pytest.raises(ValueError, match="vacío"):
        _parse_money("   ")


# ── _parse_date ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("s, expected", [
    ("2024-01-15",             date(2024, 1, 15)),  # ISO
    ("15/01/2024",             date(2024, 1, 15)),  # EU barras
    ("15-01-2024",             date(2024, 1, 15)),  # EU guiones
    ("15/01/24",               date(2024, 1, 15)),  # EU año corto
    ("01/15/2024",             date(2024, 1, 15)),  # US (día>12, sin ambigüedad)
    ("15.01.2024",             date(2024, 1, 15)),  # puntos
    ("2024/01/15",             date(2024, 1, 15)),  # ISO con barras
    ("2024-01-15 10:30:00",    date(2024, 1, 15)),  # ISO con hora
    ("2024-01-15T10:30:00",    date(2024, 1, 15)),  # ISO 8601
    ("2024-01-15 (Cuenta ES)", date(2024, 1, 15)),  # con texto entre paréntesis
    ("15 de enero de 2024",    date(2024, 1, 15)),  # texto español
    ("3 de marzo de 2025",     date(2025, 3, 3)),   # texto español día simple
])
def test_parse_date(s, expected):
    assert _parse_date(s) == expected


def test_parse_date_invalid_raises():
    with pytest.raises(ValueError, match="no reconocida"):
        _parse_date("no es una fecha")
