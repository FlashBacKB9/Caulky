import { describe, it, expect } from 'vitest'
import { buildPerspective, accountDelta, amountForAccount } from '../utils/accountView'
import type { Movement } from '../api/movements'
import type { Account } from '../api/accounts'
import type { MovementType } from '../api/movementTypes'

const acc = (id: number, name: string, is_main = false): Account => ({
  id, name, description: null, color: '#000', icon: 'wallet',
  initial_balance: 0, balance: 0, sort_order: 0, is_main,
  category: is_main ? 'corriente' : 'ahorro',
  depreciation_rate: null, value_date: null, new_car: false,
  interest_enabled: false, interest_type_id: null, interest_tax_rate: null,
})

const type = (id: number, name: string, linked_account_id: number | null): MovementType => ({
  id, name, category: 'Ahorro', income_expense_group_id: 1, color: '#000', linked_account_id,
})

const mv = (p: Partial<Movement>): Movement => ({
  id: 1, name: 'x', money: 0, date: '2026-07-30', paid: true, no_count: false,
  dinero: 0, label: 'Gasto', color: '#000', files: [], ...p,
})

const USO = acc(1, 'De Uso', true)
const AHORRO = acc(2, 'Ahorro')
const TYPES = [type(10, 'Ahorro', 2), type(11, 'Intereses A Favor', null)]
const desdeAhorro = buildPerspective(2, [USO, AHORRO], TYPES)!
const desdeUso    = buildPerspective(1, [USO, AHORRO], TYPES)!

describe('accountDelta', () => {
  it('invierte el traspaso de ahorro visto desde la cuenta de ahorro', () => {
    // Registrado desde la cuenta de uso: sale dinero (dinero negativo)
    const traspaso = mv({ money: 1879.46, dinero: -1879.46, movement_type_id: 10 })
    expect(accountDelta(traspaso, desdeAhorro)).toBe(1879.46)
    expect(accountDelta(traspaso, desdeUso)).toBe(-1879.46)
  })

  it('usa el importe en crudo del tipo vinculado, aunque esté en el grupo Ingreso', () => {
    // Un subtipo vinculado clasificado como ingreso deja `dinero` en positivo. El saldo que
    // calcula el backend suma `money`, así que -dinero daría el signo contrario.
    const aporteComoIngreso = mv({ money: 8367, dinero: 8367, movement_type_id: 10 })
    expect(accountDelta(aporteComoIngreso, desdeAhorro)).toBe(8367)
  })

  it('una devolución sobre el tipo vinculado saca dinero de la cuenta', () => {
    const devolucion = mv({ money: -300, dinero: 300, movement_type_id: 10 })
    expect(accountDelta(devolucion, desdeAhorro)).toBe(-300)
  })

  it('no invierte lo que llega por account_id, como los intereses', () => {
    const interes = mv({ money: 13.08, dinero: 13.08, movement_type_id: 11, account_id: 2 })
    expect(accountDelta(interes, desdeAhorro)).toBe(13.08)
  })

  it('da signo opuesto a cada lado de una transferencia', () => {
    const tr = mv({ money: 500, dinero: -500, is_transfer: true, from_account_id: 1, account_id: 2 })
    expect(accountDelta(tr, desdeAhorro)).toBe(500)
    expect(accountDelta(tr, desdeUso)).toBe(-500)
  })

  it('ignora la transferencia ajena a la cuenta', () => {
    const tr = mv({ money: 500, dinero: -500, is_transfer: true, from_account_id: 3, account_id: 4 })
    expect(accountDelta(tr, desdeAhorro)).toBeNull()
  })

  it('la cuenta principal se queda los movimientos sin cuenta asignada', () => {
    const gasto = mv({ money: -50, dinero: -50, movement_type_id: 99 })
    expect(accountDelta(gasto, desdeUso)).toBe(-50)
    expect(accountDelta(gasto, desdeAhorro)).toBeNull()
  })

  it('la principal no invierte por tipo vinculado', () => {
    const conCuenta = mv({ money: -50, dinero: -50, movement_type_id: 10, account_id: 1 })
    expect(accountDelta(conCuenta, desdeUso)).toBe(-50)
  })

  it('sin cuenta activa no hay perspectiva', () => {
    expect(buildPerspective(null, [USO, AHORRO], TYPES)).toBeNull()
    expect(accountDelta(mv({ dinero: 5 }), null)).toBeNull()
  })
})

describe('amountForAccount', () => {
  it('cae al importe global cuando el movimiento no es de la cuenta', () => {
    const ajeno = mv({ money: -20, dinero: -20, account_id: 7 })
    expect(amountForAccount(ajeno, desdeAhorro)).toBe(-20)
    expect(amountForAccount(ajeno, null)).toBe(-20)
  })
})
