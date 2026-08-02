import { describe, it, expect } from 'vitest'
import { computeInterestStats } from '../utils/interestAccounts'
import type { AccountPerspective } from '../utils/accountView'
import type { Movement } from '../api/movements'

const AHORRO: AccountPerspective = { accountId: 2, isMain: false, linkedTypeIds: new Set([10]) }
const INTERES_TYPE = 11

let seq = 0
const mv = (p: Partial<Movement>): Movement => ({
  id: ++seq, name: 'x', money: 0, date: '2026-07-01', paid: true, no_count: false,
  dinero: 0, label: 'Ingreso', color: '#000', files: [], ...p,
})

// Traspaso desde la cuenta de uso: se registra allí en negativo y entra aquí en positivo
const aporte = (date: string, amount: number) =>
  mv({ date, money: amount, dinero: -amount, movement_type_id: 10 })
const interes = (date: string, net: number) =>
  mv({ date, money: net, dinero: net, movement_type_id: INTERES_TYPE, account_id: 2 })

describe('computeInterestStats', () => {
  it('usa el saldo medio diario, no el de cierre (caso del traspaso a fin de mes)', () => {
    // 8367 durante casi todo julio; el día 30 entra un traspaso de 1879.46
    // El 1 de agosto se abonan 13.08 netos, que solo devengaron 2 días sobre el saldo alto.
    const movs = [
      aporte('2026-06-15', 8367),
      aporte('2026-07-30', 1879.46),
      interes('2026-08-01', 13.08),
    ]
    const saldoActual = 8367 + 1879.46 + 13.08
    const st = computeInterestStats(movs, AHORRO, saldoActual, INTERES_TYPE, 0.19)
    const agosto = st.months.find(m => m.month === '2026-08')!

    // Media de julio: 29 días a 8367 y 2 días a 10246.46
    const esperada = Math.round(((8367 * 29 + 10246.46 * 2) / 31) * 100) / 100
    expect(agosto.avgBalance).toBe(esperada)
    expect(esperada).toBeCloseTo(8488.26, 2)
    expect(agosto.accrualDays).toBe(31)

    // El cierre de julio (10246.46) daría un tipo mucho más bajo: esa era la regresión
    const bruto = 13.08 / 0.81
    expect(agosto.gross).toBeCloseTo(bruto, 2)
    expect(agosto.annualRate).toBeCloseTo((bruto / esperada) * (365 / 31) * 100, 1)
    // Sanidad: con el cierre saldría ~1.9%, con la media ~2.2%
    expect(agosto.annualRate!).toBeGreaterThan(2.1)
  })

  it('con saldo estable el tipo es el nominal', () => {
    // 12000 constantes durante junio; en julio abonan 20 netos sin retención
    const st = computeInterestStats(
      [aporte('2026-05-01', 12000), interes('2026-07-01', 20)],
      AHORRO, 12020, INTERES_TYPE, null,
    )
    const julio = st.months.find(m => m.month === '2026-07')!
    expect(julio.avgBalance).toBe(12000)
    expect(julio.gross).toBe(20)
    // 20/12000 en 30 días → anualizado a 365
    expect(julio.annualRate).toBeCloseTo((20 / 12000) * (365 / 30) * 100, 2)
  })

  it('eleva a bruto el abono con retención', () => {
    const st = computeInterestStats(
      [aporte('2026-05-01', 10000), interes('2026-07-01', 10)],
      AHORRO, 10010, INTERES_TYPE, 0.19,
    )
    const julio = st.months.find(m => m.month === '2026-07')!
    expect(julio.net).toBe(10)
    expect(julio.gross).toBe(12.35)
    expect(st.totalNet).toBe(10)
    expect(st.totalGross).toBe(12.35)
  })

  it('el saldo de cierre de cada mes cuadra con el saldo actual', () => {
    const st = computeInterestStats(
      [aporte('2026-06-10', 5000), aporte('2026-07-10', 1000), interes('2026-08-01', 8)],
      AHORRO, 6008, INTERES_TYPE, null,
    )
    expect(st.months.find(m => m.month === '2026-06')!.balance).toBe(5000)
    expect(st.months.find(m => m.month === '2026-07')!.balance).toBe(6000)
    expect(st.months.find(m => m.month === '2026-08')!.balance).toBe(6008)
  })

  it('no marca base ni tipo en los meses sin abono', () => {
    const st = computeInterestStats([aporte('2026-06-10', 5000)], AHORRO, 5000, INTERES_TYPE, null)
    const junio = st.months.find(m => m.month === '2026-06')!
    expect(junio.net).toBe(0)
    expect(junio.avgBalance).toBeNull()
    expect(junio.annualRate).toBeNull()
    expect(st.payments).toHaveLength(0)
  })

  it('ordena los abonos del más reciente al más antiguo y promedia el tipo', () => {
    const st = computeInterestStats(
      [aporte('2026-05-01', 10000), interes('2026-07-01', 20), interes('2026-08-01', 20)],
      AHORRO, 10040, INTERES_TYPE, null,
    )
    expect(st.payments.map(p => p.month)).toEqual(['2026-08', '2026-07'])
    expect(st.avgAnnualRate).toBeGreaterThan(0)
  })

  it('ignora los movimientos de otras cuentas', () => {
    const ajeno = mv({ date: '2026-07-05', money: 500, dinero: 500, account_id: 99 })
    const st = computeInterestStats(
      [aporte('2026-05-01', 10000), interes('2026-07-01', 10), ajeno],
      AHORRO, 10010, INTERES_TYPE, null,
    )
    expect(st.months.find(m => m.month === '2026-07')!.balance).toBe(10010)
  })

  it('sin movimientos o sin subtipo no calcula nada', () => {
    expect(computeInterestStats([], AHORRO, 0, INTERES_TYPE, null).months).toEqual([])
    const sinTipo = computeInterestStats(
      [aporte('2026-05-01', 100), interes('2026-07-01', 1)], AHORRO, 101, null, null,
    )
    expect(sinTipo.payments).toHaveLength(0)
    expect(sinTipo.totalNet).toBe(0)
  })
})
