import type { Movement } from '../api/movements'
import { accountDelta, type AccountPerspective } from './accountView'

/** Un mes de la cuenta remunerada: saldo de cierre y, si lo hubo, el abono de intereses. */
export interface InterestMonth {
  month: string          // 'YYYY-MM'
  balance: number        // saldo al cierre del mes
  net: number            // intereses abonados en el mes, tal cual llegan (ya con retención)
  gross: number          // intereses antes de retención
  /** Saldo sobre el que se remuneró: el cierre del mes anterior. */
  baseBalance: number | null
  /** Tipo anual estimado a partir del bruto y del saldo base (%). */
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

/**
 * Reconstruye la evolución mensual de una cuenta remunerada y deduce el tipo de interés real.
 *
 * El saldo de cierre se calcula hacia atrás desde el saldo actual, igual que la columna de
 * saldo de Movimientos, para que ambos cuadren. Los intereses de un mes remuneran el saldo
 * del cierre del mes anterior: los de agosto pagan por lo que había a finales de julio.
 *
 * `taxRate` es la retención en fracción (0.19 = 19%): el abono llega neto, así que el bruto
 * es `neto / (1 - retención)`.
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

  const deltaByMonth = new Map<string, number>()
  const netByMonth   = new Map<string, number>()
  let minMonth: string | null = null
  let maxMonth: string | null = null

  for (const mv of movements) {
    const delta = accountDelta(mv, perspective)
    if (delta === null) continue
    const m = monthOf(mv.date)
    deltaByMonth.set(m, (deltaByMonth.get(m) ?? 0) + delta)
    if (minMonth === null || m < minMonth) minMonth = m
    if (maxMonth === null || m > maxMonth) maxMonth = m
    if (interestTypeId != null && mv.movement_type_id === interestTypeId) {
      netByMonth.set(m, (netByMonth.get(m) ?? 0) + delta)
    }
  }
  if (minMonth === null || maxMonth === null) return empty

  // Saldo de cierre hacia atrás desde el saldo actual
  const all = monthRange(minMonth, maxMonth)
  const balanceOf = new Map<string, number>()
  let running = currentBalance
  for (let i = all.length - 1; i >= 0; i--) {
    balanceOf.set(all[i], Math.round(running * 100) / 100)
    running -= deltaByMonth.get(all[i]) ?? 0
  }

  const months: InterestMonth[] = all.map(month => {
    const net  = Math.round((netByMonth.get(month) ?? 0) * 100) / 100
    const gross = Math.round(toGross(net) * 100) / 100
    const base = balanceOf.get(prevMonth(month)) ?? null
    // El saldo base descuenta el propio abono si cayó en el mes anterior; no se ajusta:
    // el interés se calcula sobre el saldo que efectivamente había al cierre.
    const annualRate = net > 0 && base != null && base > 0
      ? Math.round((gross / base) * 12 * 10000) / 100
      : null
    return { month, balance: balanceOf.get(month) ?? 0, net, gross, baseBalance: base, annualRate }
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
