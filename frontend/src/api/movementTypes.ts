import api from './client'

export interface MovementType {
  id: number
  name: string
  category: string
  income_expense_group_id: number
  color: string
  linked_account_id: number | null
}

interface TypePayload {
  name: string
  category: string
  income_expense_group_id: number
  color?: string | null
  linked_account_id?: number | null
}

export const getMovementTypes = () =>
  api.get<MovementType[]>('/movement-types').then(r => r.data)

export const createMovementType = (data: TypePayload) =>
  api.post<MovementType>('/movement-types', data).then(r => r.data)

export const updateMovementType = (id: number, data: TypePayload) =>
  api.put<MovementType>(`/movement-types/${id}`, data).then(r => r.data)

export const deleteMovementType = (id: number) => api.delete(`/movement-types/${id}`)
