import type { Movement } from '../api/movements'

// Entradas visibles del tooltip: descarta las series a 0 € y ordena de mayor a menor
export interface TooltipEntry { name?: string | number; value?: number | string; color?: string }

export function visibleTooltipEntries(payload: TooltipEntry[] | undefined): TooltipEntry[] {
  if (!payload?.length) return []
  return payload
    .filter(e => Math.abs(Number(e.value ?? 0)) >= 0.005)
    .sort((a, b) => Number(b.value) - Number(a.value))
}

// Un movimiento pertenece a Gastos si dinero < 0; a Ingresos si dinero > 0
// (tipos de ingreso y devoluciones de cualquier tipo), excluyendo transferencias.
export function matchesControlMode(mv: Movement, mode: 'gastos' | 'ingresos'): boolean {
  return mode === 'gastos' ? mv.dinero < 0 : mv.dinero > 0 && !mv.is_transfer
}
