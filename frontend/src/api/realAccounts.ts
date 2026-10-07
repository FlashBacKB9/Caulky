import api from './client'

export interface RealAccount {
  id: number
  name: string
  entity_name: string
  account_number: string | null
  color: string
  linked_account_ids: number[]
  /** Tarjetas pagadas desde una de sus cuentas: cuelgan de ella sin estar vinculadas (solo lectura) */
  card_account_ids?: number[]
}

/** Todas las cuentas que forman la cuenta real: las vinculadas y las tarjetas que paga. */
export const realAccountMemberIds = (ra: RealAccount): number[] =>
  [...ra.linked_account_ids, ...(ra.card_account_ids ?? [])]

export const getRealAccounts = () =>
  api.get<RealAccount[]>('/real-accounts').then(r => r.data)

/** Sin cuentas vinculadas, el backend crea una con el mismo nombre y `initial_balance`. */
export const createRealAccount = (body: Omit<RealAccount, 'id' | 'card_account_ids'> & { initial_balance?: number }) =>
  api.post<RealAccount>('/real-accounts', body).then(r => r.data)

export const updateRealAccount = (id: number, body: Partial<Omit<RealAccount, 'id' | 'card_account_ids'>>) =>
  api.put<RealAccount>(`/real-accounts/${id}`, body).then(r => r.data)

export const deleteRealAccount = (id: number) =>
  api.delete(`/real-accounts/${id}`)
