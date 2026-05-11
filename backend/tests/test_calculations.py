import pytest

from app.services.calculations import compute_dinero, compute_label


# ── compute_dinero ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("money,group,expected", [
    (100,   "Ingreso", 100.0),   # ingreso positivo → suma positiva
    (100,   "Gasto",  -100.0),   # gasto positivo → suma negativa
    (50,    "Vivienda", -50.0),  # cualquier grupo no-Ingreso → negativo
    (-30,   "Ingreso",  30.0),   # devolución de ingreso → positiva
    (-30,   "Gasto",    30.0),   # devolución de gasto → positiva (mismo signo)
    (0,     "Ingreso",   0.0),   # cero, ingreso → cero
    (0,     "Gasto",     0.0),   # cero, gasto → cero
    (1000,  "Ahorro", -1000.0),  # ahorro (no Ingreso) → negativo
])
def test_compute_dinero(money, group, expected):
    assert compute_dinero(money, group) == pytest.approx(expected)


# ── compute_label ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("money,group,expected", [
    (100,  "Ingreso", "Ingreso"),      # ingreso positivo
    (100,  "Gasto",   "Gasto"),        # gasto positivo
    (100,  "Vivienda","Gasto"),        # otro grupo no-Ingreso → Gasto
    (-50,  "Ingreso", "Devolución"),   # devolución de ingreso
    (-50,  "Gasto",   "Devolución"),   # devolución de gasto
    (0,    "Ingreso", "Ingreso"),      # cero se trata como ingreso si grupo Ingreso
    (0,    "Gasto",   "Gasto"),        # cero se trata como gasto si grupo Gasto
])
def test_compute_label(money, group, expected):
    assert compute_label(money, group) == expected
