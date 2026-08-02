import { describe, it, expect } from 'vitest'
import { computeInterestStats } from '../utils/interestAccounts'
import type { AccountPerspective } from '../utils/accountView'
import type { Movement } from '../api/movements'

const AHORRO: AccountPerspective = { accountId: 2, isMain: false, linkedTypeIds: new Set([10]) }
const INTERES_TYPE = 11

const mv = (p: Partial<Movement>): Movement => ({
  id: Math.random(), name: 'x', money: 0, date: '2026-07-01', paid: true, no_count: false,
  dinero: 0, label: 'Ingreso', color: '#000', files: [], ...p,
})

// Aporte de 1000 en junio (registrado desde la cuenta de uso, tipo vinculado)
const aporteJunio = mv({ date: '2026-06-30', money: 1000, dinero: -1000, movement_type_id: 10 })
// Intereses de julio: 10 € netos, abonados en la propia cuenta
const interesJulio = mv({ date: '2026-07-01', money: 10, dinero: 10, movement_type_id: INTERES_TYPE, account_id: 2 })

describe('computeInterestStats', () => {
  it('remunera el saldo del cierre del mes anterior', () => {
    // Saldo actual 1010 = 1000 aportados + 10 de intereses
    const st = computeInterestStats([aporteJunio, interesJulio], AHORRO, 1010, INTERES_TYPE, null)
    const julio = st.months.find(m => m.month === '2026-07')!
    expect(julio.net).toBe(10)
    expect(julio.baseBalance).toBe(1000)   // cierre de junio
    expect(julio.balance).toBe(1010)
    // 10 sobre 1000 al mes = 12% anual
    expect(julio.annualRate).toBe(12)
  })

  it('eleva a bruto el abono con retención', () => {
    // 10 netos con 19% de retención → 12.35 brutos
    const st = computeInterestStats([aporteJunio, interesJulio], AHORRO, 1010, INTERES_TYPE, 0.19)
    const julio = st.months.find(m => m.month === '2026-07')!
    expect(julio.net).toBe(10)
    expect(julio.gross).toBe(12.35)
    expect(julio.annualRate).toBe(14.82)   // 12.35/1000*12
    expect(st.totalGross).toBe(12.35)
    expect(st.totalNet).toBe(10)
  })

  it('rellena los meses sin abono y mantiene el saldo', () => {
    const st = computeInterestStats([aporteJunio, interesJulio], AHORRO, 1010, INTERES_TYPE, null)
    expect(st.months.map(m => m.month)).toEqual(['2026-06', '2026-07'])
    const junio = st.months[0]
    expect(junio.net).toBe(0)
    expect(junio.annualRate).toBeNull()
    expect(st.payments).toHaveLength(1)
  })

  it('ignora los movimientos de otras cuentas', () => {
    const ajeno = mv({ date: '2026-07-05', money: 500, dinero: 500, account_id: 99 })
    const st = computeInterestStats([aporteJunio, interesJulio, ajeno], AHORRO, 1010, INTERES_TYPE, null)
    expect(st.months.find(m => m.month === '2026-07')!.balance).toBe(1010)
  })

  it('promedia el tipo de varios meses', () => {
    const interesAgosto = mv({ date: '2026-08-01', money: 10.1, dinero: 10.1, movement_type_id: INTERES_TYPE, account_id: 2 })
    const st = computeInterestStats([aporteJunio, interesJulio, interesAgosto], AHORRO, 1020.1, INTERES_TYPE, null)
    expect(st.payments.map(p => p.month)).toEqual(['2026-08', '2026-07'])  // más reciente primero
    // Agosto remunera el cierre de julio (1010): 10.1/1010*12 = 12%
    expect(st.payments[0].baseBalance).toBe(1010)
    expect(st.payments[0].annualRate).toBe(12)
    expect(st.avgAnnualRate).toBe(12)
  })

  it('sin movimientos devuelve vacío', () => {
    const st = computeInterestStats([], AHORRO, 0, INTERES_TYPE, null)
    expect(st.months).toEqual([])
    expect(st.avgAnnualRate).toBeNull()
  })

  it('sin subtipo de intereses no calcula tipos', () => {
    const st = computeInterestStats([aporteJunio, interesJulio], AHORRO, 1010, null, null)
    expect(st.payments).toHaveLength(0)
    expect(st.totalNet).toBe(0)
  })
})
