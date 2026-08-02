import type { Movement } from '../api/movements'
import { accountDelta, type AccountPerspective } from './accountView'

/** Un mes de la cuenta remunerada: saldo de cierre y, si lo hubo, el abono de intereses. */
export interface InterestMonth {
  month: string          // 'YYYY-MM'
  balance: number        // saldo al cierre del mes
  net: number            // intereses abonados en el mes, tal cual llegan (ya con retención)
  gross: number          // intereses antes de retención
  /**
   * Saldo medio diario del mes de devengo (el anterior al abono). Es la base real:
   * el dinero que entra el día 30 solo devenga esos dos días, no el mes entero.
   */
  avgBalance: number | null
  /** Días del mes de devengo, para anualizar. */
  accrualDays: number | null
  /** TIN estimado: bruto / saldo medio, anualizado a 365 días (%). */
  annualRate: number | null
}

export interface InterestStats {
  months: InterestMonth[]
  /** Solo los meses con abono, del más reciente al más antiguo. */
  payments: InterestMonth[]
  totalNet: number
  totalGross: number
  /** Media de los tipos anuales de los meses con abono. */
  avgAnnualRate: number | null
}

const monthOf = (date: string) => date.slice(0, 7)

function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/** Lista continua de meses entre dos extremos, ambos incluidos. */
function monthRange(from: string, to: string): string[] {
  const out: string[] = []
  let cur = from
  // Cota defensiva: 100 años de meses
  for (let i = 0; cur <= to && i < 1200; i++) {
    out.push(cur)
    const [y, m] = cur.split('-').map(Number)
    cur = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  }
  return out
}

const daysInMonth = (month: string): number => {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** Días de un mes en formato ISO: ['2026-07-01', …, '2026-07-31'] */
function daysOf(month: string): string[] {
  const n = daysInMonth(month)
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
}

/** Lista continua de días entre dos fechas ISO, ambas incluidas. */
function dayRange(from: string, to: string): string[] {
  const out: string[] = []
  const end = new Date(to + 'T00:00:00')
  const cur = new Date(from + 'T00:00:00')
  // Cota defensiva: 50 años de días
  for (let i = 0; cur <= end && i < 18300; i++) {
    out.push(cur.toLocaleDateString('en-CA'))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

/**
 * Reconstruye la evolución de una cuenta remunerada y deduce el tipo de interés real.
 *
 * Los saldos se calculan día a día hacia atrás desde el saldo actual, igual que la columna
 * de saldo de Movimientos, para que ambos cuadren.
 *
 * La base del cálculo es el **saldo medio diario** del mes anterior al abono, no su saldo
 * de cierre: estas cuentas devengan a diario, así que un traspaso que entra el día 30 solo
 * renta esos dos días. Usar el cierre inflaría la base y hundiría el tipo resultante.
 *
 * `taxRate` es la retención en fracción (0.19 = 19%): el abono llega neto, así que el bruto
 * es `neto / (1 - retención)`. El TIN se anualiza a 365 días sobre los días del mes devengado,
 * que es la convención de estas cuentas y lo comparable con el tipo que anuncia el banco.
 */
export function computeInterestStats(
  movements: Movement[],
  perspective: AccountPerspective | null,
  currentBalance: number,
  interestTypeId: number | null,
  taxRate: number | null,
): InterestStats {
  const empty: InterestStats = { months: [], payments: [], totalNet: 0, totalGross: 0, avgAnnualRate: null }
  if (!perspective) return empty

  const rate = taxRate != null && taxRate > 0 && taxRate < 1 ? taxRate : 0
  const toGross = (net: number) => rate > 0 ? net / (1 - rate) : net

  const deltaByDay  = new Map<string, number>()
  const netByMonth  = new Map<string, number>()
  let minDate: string | null = null
  let maxDate: string | null = null

  for (const mv of movements) {
    const delta = accountDelta(mv, perspective)
    if (delta === null) continue
    deltaByDay.set(mv.date, (deltaByDay.get(mv.date) ?? 0) + delta)
    if (minDate === null || mv.date < minDate) minDate = mv.date
    if (maxDate === null || mv.date > maxDate) maxDate = mv.date
    if (interestTypeId != null && mv.movement_type_id === interestTypeId) {
      const m = monthOf(mv.date)
      netByMonth.set(m, (netByMonth.get(m) ?? 0) + delta)
    }
  }
  if (minDate === null || maxDate === null) return empty

  // Saldo al cierre de cada día, hacia atrás desde el saldo actual
  const days = dayRange(minDate, maxDate)
  const balanceOfDay = new Map<string, number>()
  let running = currentBalance
  for (let i = days.length - 1; i >= 0; i--) {
    balanceOfDay.set(days[i], running)
    running -= deltaByDay.get(days[i]) ?? 0
  }
  // Saldo antes del primer movimiento, para los días que caen fuera del rango conocido
  const openingBalance = running

  const balanceAt = (day: string): number => {
    if (day < days[0]) return openingBalance
    if (day > days[days.length - 1]) return currentBalance
    return balanceOfDay.get(day) ?? openingBalance
  }

  const all = monthRange(monthOf(minDate), monthOf(maxDate))

  const months: InterestMonth[] = all.map(month => {
    const net   = Math.round((netByMonth.get(month) ?? 0) * 100) / 100
    const gross = Math.round(toGross(net) * 100) / 100
    const closing = Math.round(balanceAt(`${month}-${String(daysInMonth(month)).padStart(2, '0')}`) * 100) / 100

    // Base: media diaria del mes de devengo, que es el anterior al abono
    const accrual = prevMonth(month)
    const accrualDays = daysInMonth(accrual)
    const avgRaw = daysOf(accrual).reduce((s, d) => s + balanceAt(d), 0) / accrualDays
    const avgBalance = Math.round(avgRaw * 100) / 100

    const annualRate = net > 0 && avgBalance > 0
      ? Math.round((gross / avgBalance) * (365 / accrualDays) * 10000) / 100
      : null

    return {
      month, balance: closing, net, gross,
      avgBalance: net > 0 ? avgBalance : null,
      accrualDays: net > 0 ? accrualDays : null,
      annualRate,
    }
  })

  const payments = months.filter(m => m.net > 0).slice().reverse()
  const totalNet   = Math.round(payments.reduce((s, m) => s + m.net, 0) * 100) / 100
  const totalGross = Math.round(payments.reduce((s, m) => s + m.gross, 0) * 100) / 100
  const rated = payments.filter(m => m.annualRate != null)
  const avgAnnualRate = rated.length
    ? Math.round((rated.reduce((s, m) => s + m.annualRate!, 0) / rated.length) * 100) / 100
    : null

  return { months, payments, totalNet, totalGross, avgAnnualRate }
}
