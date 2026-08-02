import type { Movement } from '../api/movements'
import type { Account } from '../api/accounts'
import type { MovementType } from '../api/movementTypes'

/** Cómo se ve el libro desde una cuenta concreta. */
export interface AccountPerspective {
  accountId: number
  isMain: boolean
  /** Tipos cuya cuenta vinculada es ésta: sus movimientos se ven invertidos desde aquí. */
  linkedTypeIds: Set<number>
}

export function buildPerspective(
  accountId: number | null,
  accounts: Account[],
  types: MovementType[],
): AccountPerspective | null {
  if (accountId === null) return null
  const acc = accounts.find(a => a.id === accountId)
  if (!acc) return null
  return {
    accountId,
    isMain: acc.is_main,
    // La cuenta principal recibe los movimientos sin cuenta asignada, no por tipo vinculado
    linkedTypeIds: acc.is_main
      ? new Set<number>()
      : new Set(types.filter(tp => tp.linked_account_id === accountId).map(tp => tp.id)),
  }
}

/**
 * Cuánto mueve el saldo de esta cuenta, con su signo: positivo si entra, negativo si sale.
 * Devuelve null si el movimiento no afecta a la cuenta.
 *
 * El orden de las ramas importa: un movimiento puede llegar a la cuenta por `account_id`
 * (los intereses, por ejemplo) o por tipo vinculado (el traspaso de ahorro), y solo el
 * segundo se invierte, porque está registrado desde la cuenta de origen.
 */
export function accountDelta(mv: Movement, persp: AccountPerspective | null): number | null {
  if (!persp) return null
  if (mv.is_transfer) {
    if (mv.account_id === persp.accountId)      return Math.abs(mv.money)
    if (mv.from_account_id === persp.accountId) return -Math.abs(mv.money)
    return null
  }
  if (mv.account_id === persp.accountId) return mv.dinero
  if (persp.isMain && mv.account_id == null) return mv.dinero
  if (mv.movement_type_id != null && persp.linkedTypeIds.has(mv.movement_type_id)) return -mv.dinero
  return null
}

/** Importe a mostrar en un listado: desde la cuenta activa si aplica, si no el global. */
export function amountForAccount(mv: Movement, persp: AccountPerspective | null): number {
  return accountDelta(mv, persp) ?? mv.dinero
}
