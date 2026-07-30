import { describe, test, expect } from 'vitest'
import { visibleTooltipEntries, matchesControlMode } from '../utils/expenseControl'
import type { Movement } from '../api/movements'

// ── Helpers ───────────────────────────────────────────────────────────────────

function mv(overrides: Partial<Movement> = {}): Movement {
  return {
    id: 1, name: 'mv', money: 100, dinero: -100, date: '2026-05-14',
    movement_type_id: 1, paid: true, no_count: false, is_shared: false,
    label: '', color: '', files: [],
    ...overrides,
  }
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

describe('visibleTooltipEntries', () => {
  test('oculta las series a 0 €', () => {
    const out = visibleTooltipEntries([
      { name: '1_2026', value: 0 },
      { name: '2_2026', value: 104.68 },
      { name: '3_2026', value: 0 },
      { name: '4_2026', value: 51.35 },
    ])
    expect(out.map(e => e.name)).toEqual(['2_2026', '4_2026'])
  })

  test('ordena de mayor a menor', () => {
    const out = visibleTooltipEntries([
      { name: 'a', value: 10 },
      { name: 'b', value: 300 },
      { name: 'c', value: 50 },
    ])
    expect(out.map(e => e.value)).toEqual([300, 50, 10])
  })

  test('descarta importes por debajo de medio céntimo', () => {
    expect(visibleTooltipEntries([{ name: 'a', value: 0.004 }])).toHaveLength(0)
    expect(visibleTooltipEntries([{ name: 'a', value: 0.005 }])).toHaveLength(1)
  })

  test('payload vacío o ausente devuelve lista vacía', () => {
    expect(visibleTooltipEntries([])).toEqual([])
    expect(visibleTooltipEntries(undefined)).toEqual([])
  })
})

// ── Gastos / Ingresos ─────────────────────────────────────────────────────────

describe('matchesControlMode', () => {
  test('un gasto (dinero < 0) solo cuenta en Gastos', () => {
    const gasto = mv({ money: 90.22, dinero: -90.22 })
    expect(matchesControlMode(gasto, 'gastos')).toBe(true)
    expect(matchesControlMode(gasto, 'ingresos')).toBe(false)
  })

  test('un ingreso (dinero > 0) solo cuenta en Ingresos', () => {
    const nomina = mv({ money: 2049.93, dinero: 2049.93 })
    expect(matchesControlMode(nomina, 'ingresos')).toBe(true)
    expect(matchesControlMode(nomina, 'gastos')).toBe(false)
  })

  test('una devolución (importe negativo en un tipo de gasto) cuenta como ingreso', () => {
    // El backend invierte el signo: money -45.5 en un tipo de gasto → dinero +45.5
    const devolucion = mv({ money: -45.5, dinero: 45.5 })
    expect(matchesControlMode(devolucion, 'ingresos')).toBe(true)
    expect(matchesControlMode(devolucion, 'gastos')).toBe(false)
  })

  test('las transferencias entrantes no cuentan como ingreso', () => {
    const transfer = mv({ money: 500, dinero: 500, is_transfer: true })
    expect(matchesControlMode(transfer, 'ingresos')).toBe(false)
  })
})
