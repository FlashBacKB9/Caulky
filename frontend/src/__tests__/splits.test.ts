import { describe, test, expect } from 'vitest'
import type { Movement } from '../api/movements'
import { expandSplits, mainSplitType, movementTypeIds, normalizeSplits } from '../utils/splits'

function mv(overrides: Partial<Movement> = {}): Movement {
  return {
    id: 1, name: 'Mercadona', money: 40, date: '2026-10-03', paid: true, no_count: false,
    dinero: -40, label: 'Gasto', color: '#000', files: [], movement_type_id: 1, ...overrides,
  }
}

describe('expandSplits', () => {
  test('reparte importe y dinero entre las partes', () => {
    const parts = expandSplits([mv({ splits: [{ movement_type_id: 1, money: 30 }, { movement_type_id: 2, money: 10 }] })])
    expect(parts.map(p => [p.movement_type_id, p.money, p.dinero])).toEqual([[1, 30, -30], [2, 10, -10]])
  })

  test('escala my_share de un compartido', () => {
    const parts = expandSplits([mv({ is_shared: true, my_share: 20, splits: [{ movement_type_id: 1, money: 30 }, { movement_type_id: 2, money: 10 }] })])
    expect(parts.map(p => p.my_share)).toEqual([15, 5])
  })

  test('sin partes devuelve la misma lista', () => {
    const list = [mv(), mv({ id: 2 })]
    expect(expandSplits(list)).toBe(list)
  })
})

describe('helpers', () => {
  test('movementTypeIds usa las partes o el tipo', () => {
    expect(movementTypeIds(mv({ splits: [{ movement_type_id: 3, money: 1 }, { movement_type_id: 4, money: 2 }] }))).toEqual([3, 4])
    expect(movementTypeIds(mv())).toEqual([1])
    expect(movementTypeIds(mv({ movement_type_id: undefined }))).toEqual([])
  })

  test('normalizeSplits agrupa, redondea y quita vacías', () => {
    expect(normalizeSplits([
      { movement_type_id: 1, money: 1.005 }, { movement_type_id: 1, money: 2 }, { movement_type_id: 2, money: 0 },
    ])).toEqual([{ movement_type_id: 1, money: 3.01 }])
  })

  test('mainSplitType elige la parte mayor', () => {
    expect(mainSplitType([{ movement_type_id: 1, money: -5 }, { movement_type_id: 2, money: -9 }])).toBe(2)
    expect(mainSplitType([])).toBeUndefined()
  })
})
