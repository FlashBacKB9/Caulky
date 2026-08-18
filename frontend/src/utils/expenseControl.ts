import type { Movement } from '../api/movements'

// Entradas visibles del tooltip: descarta las series a 0 € y ordena de mayor a menor.
// El payload de Recharts es readonly y su `value` admite arrays, de ahí los tipos laxos.
export interface TooltipEntry { name?: unknown; value?: unknown; color?: string }

export function visibleTooltipEntries<T extends TooltipEntry>(payload: readonly T[] | undefined): T[] {
  if (!payload?.length) return []
  return payload
    .filter(e => Math.abs(Number(e.value ?? 0)) >= 0.005)
    .sort((a, b) => Number(b.value) - Number(a.value))
}

// Importe negativo en un tipo de gasto = devolución de ese gasto (un reintegro, un
// bizum de un amigo por su parte). El backend le da dinero > 0, pero no es un ingreso:
// es un gasto negativo, así que resta del gasto de su propia categoría.
export function isExpenseRefund(mv: Movement, incomeTypeIds: ReadonlySet<number>): boolean {
  return mv.money < 0 && mv.movement_type_id != null && !incomeTypeIds.has(mv.movement_type_id)
}

// Un movimiento pertenece a Gastos si dinero < 0 (o es una devolución de un gasto);
// a Ingresos si dinero > 0, excluyendo transferencias y esas mismas devoluciones.
export function matchesControlMode(
  mv: Movement,
  mode: 'gastos' | 'ingresos',
  incomeTypeIds: ReadonlySet<number> = new Set(),
): boolean {
  if (isExpenseRefund(mv, incomeTypeIds)) return mode === 'gastos'
  return mode === 'gastos' ? mv.dinero < 0 : mv.dinero > 0 && !mv.is_transfer
}

// Importe con signo que aporta el movimiento al modo activo: en Gastos los gastos
// suman y las devoluciones restan; en Ingresos siempre suma.
export function controlModeAmount(mv: Movement, mode: 'gastos' | 'ingresos'): number {
  return mode === 'gastos' ? -mv.dinero : mv.dinero
}
