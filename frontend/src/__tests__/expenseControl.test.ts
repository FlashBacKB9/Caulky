import { describe, test, expect } from 'vitest'
import { visibleTooltipEntries, matchesControlMode, controlModeAmount, isExpenseRefund } from '../utils/expenseControl'
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

// Tipo 1 = tipo de gasto, tipo 9 = tipo de ingreso (nómina y similares)
const INCOME_TYPES = new Set([9])

describe('matchesControlMode', () => {
  test('un gasto (dinero < 0) solo cuenta en Gastos', () => {
    const gasto = mv({ money: 90.22, dinero: -90.22 })
    expect(matchesControlMode(gasto, 'gastos', INCOME_TYPES)).toBe(true)
    expect(matchesControlMode(gasto, 'ingresos', INCOME_TYPES)).toBe(false)
  })

  test('un ingreso (dinero > 0) solo cuenta en Ingresos', () => {
    const nomina = mv({ money: 2049.93, dinero: 2049.93, movement_type_id: 9 })
    expect(matchesControlMode(nomina, 'ingresos', INCOME_TYPES)).toBe(true)
    expect(matchesControlMode(nomina, 'gastos', INCOME_TYPES)).toBe(false)
  })

  test('una devolución sobre un tipo de gasto cuenta en Gastos, no en Ingresos', () => {
    // El backend invierte el signo: money -45.5 en un tipo de gasto → dinero +45.5,
    // pero es un gasto negativo: resta del gasto de su categoría.
    const devolucion = mv({ money: -45.5, dinero: 45.5 })
    expect(matchesControlMode(devolucion, 'gastos', INCOME_TYPES)).toBe(true)
    expect(matchesControlMode(devolucion, 'ingresos', INCOME_TYPES)).toBe(false)
  })

  test('un importe negativo en un tipo de ingreso sigue siendo ingreso', () => {
    const ajuste = mv({ money: -45.5, dinero: 45.5, movement_type_id: 9 })
    expect(matchesControlMode(ajuste, 'ingresos', INCOME_TYPES)).toBe(true)
    expect(matchesControlMode(ajuste, 'gastos', INCOME_TYPES)).toBe(false)
  })

  test('las transferencias entrantes no cuentan como ingreso', () => {
    const transfer = mv({ money: 500, dinero: 500, is_transfer: true, movement_type_id: 9 })
    expect(matchesControlMode(transfer, 'ingresos', INCOME_TYPES)).toBe(false)
  })
})

describe('isExpenseRefund', () => {
  test('solo los importes negativos de tipos de gasto son devolución', () => {
    expect(isExpenseRefund(mv({ money: -125, dinero: 125 }), INCOME_TYPES)).toBe(true)
    expect(isExpenseRefund(mv({ money: 250, dinero: -250 }), INCOME_TYPES)).toBe(false)
    expect(isExpenseRefund(mv({ money: -125, dinero: 125, movement_type_id: 9 }), INCOME_TYPES)).toBe(false)
  })
})

describe('controlModeAmount', () => {
  test('en Gastos el gasto suma y la devolución resta', () => {
    const gasto      = mv({ money: 250, dinero: -250 })
    const devolucion = mv({ money: -125, dinero: 125 })
    expect(controlModeAmount(gasto, 'gastos')).toBe(250)
    expect(controlModeAmount(devolucion, 'gastos')).toBe(-125)
    // El caso real: 250 € pagados por dos, 125 € devueltos por bizum → 125 € de gasto neto
    expect(controlModeAmount(gasto, 'gastos') + controlModeAmount(devolucion, 'gastos')).toBe(125)
  })

  test('en Ingresos el importe es el dinero tal cual', () => {
    expect(controlModeAmount(mv({ money: 2049.93, dinero: 2049.93, movement_type_id: 9 }), 'ingresos')).toBe(2049.93)
  })
})
