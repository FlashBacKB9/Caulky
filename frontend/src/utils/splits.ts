import type { Movement, MovementSplit } from '../api/movements'

/** Valor de la opción «Múltiple» en los selectores de tipo */
export const MULTI_TYPE = '__multi__'

/**
 * Categoría múltiple: reparte cada movimiento dividido en un movimiento por parte, con su
 * tipo y su parte del importe (y de `dinero` y `my_share`). Es para agregar por categoría;
 * los movimientos resultantes comparten id con el original, así que no sirven para listar.
 */
export function expandSplits(movements: Movement[]): Movement[] {
  if (!movements.some(mv => mv.splits?.length)) return movements
  const out: Movement[] = []
  for (const mv of movements) {
    if (!mv.splits?.length || !mv.money) { out.push(mv); continue }
    for (const s of mv.splits) {
      const r = s.money / mv.money
      out.push({
        ...mv,
        movement_type_id: s.movement_type_id,
        money: s.money,
        dinero: mv.dinero * r,
        my_share: mv.my_share != null ? mv.my_share * r : mv.my_share,
        splits: [],
      })
    }
  }
  return out
}

/** Tipos en los que cuenta un movimiento: los de sus partes o, si no tiene, el suyo. */
export function movementTypeIds(mv: Pick<Movement, 'movement_type_id' | 'splits'>): number[] {
  if (mv.splits?.length) return mv.splits.map(s => s.movement_type_id)
  return mv.movement_type_id != null ? [mv.movement_type_id] : []
}

/** Agrupa partes repetidas, quita las vacías y redondea a céntimos. */
export function normalizeSplits(parts: MovementSplit[]): MovementSplit[] {
  const byType = new Map<number, number>()
  for (const p of parts) byType.set(p.movement_type_id, (byType.get(p.movement_type_id) ?? 0) + p.money)
  return [...byType]
    .map(([movement_type_id, money]) => ({ movement_type_id, money: Math.round(money * 100) / 100 }))
    .filter(p => p.money !== 0)
}

/** Tipo principal (el de la parte mayor), como hace el backend. */
export function mainSplitType(parts: MovementSplit[]): number | undefined {
  let best: MovementSplit | undefined
  for (const p of parts) if (!best || Math.abs(p.money) > Math.abs(best.money)) best = p
  return best?.movement_type_id
}

/**
 * Ticket repartido por tipos: la comida y los suministros, cada uno con el tipo configurado
 * en Ajustes → Tickets, en un solo movimiento. `ready` es falso si falta algún tipo.
 */
export function ticketSplit(food: number, supplies: number): { parts: MovementSplit[]; ready: boolean } {
  const read = (key: string) => { try { return parseInt(localStorage.getItem(key) || '') || null } catch { return null } }
  const used = ([[read('ticket_food_type_id'), food], [read('ticket_supplies_type_id'), supplies]] as const)
    .filter(([, total]) => total > 0.005)
  const ready = used.length > 0 && used.every(([id]) => id != null)
  return {
    ready,
    parts: ready ? normalizeSplits(used.map(([id, total]) => ({ movement_type_id: id!, money: total }))) : [],
  }
}
