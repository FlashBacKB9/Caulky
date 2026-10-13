import api from './client'
import { apiUrl } from '../offline/platform'

export interface MovementFile {
  id: number
  original_name: string
  mime_type: string
  created_at: string
}

/** Parte de un movimiento con categoría múltiple. */
export interface MovementSplit {
  movement_type_id: number
  money: number
}

export interface Movement {
  id: number
  name: string
  money: number
  date: string
  bank_date?: string
  movement_type_id?: number
  account_id?: number
  is_transfer?: boolean
  /** Liquidación de tarjeta: corte del ciclo que cobra. Su dinero es 0 (no es gasto). */
  credit_cycle_end?: string | null
  credit_cycle_start?: string | null
  from_account_id?: number
  paid: boolean
  no_count: boolean
  notes?: string
  is_shared?: boolean
  shared_between?: number
  my_share?: number
  dinero: number
  label: string
  color: string
  files: MovementFile[]
  /** Categoría múltiple: si hay partes, movement_type_id es el tipo de la mayor. */
  splits?: MovementSplit[]
}

export const getMovements = (params?: { year?: number; month?: number; unassigned?: boolean }) =>
  api.get<Movement[]>('/movements', { params }).then(r => r.data)

/** Liquidación de tarjeta ↔ compras: `items` si es una liquidación, `settlement` si es una compra ya cobrada. */
export interface CreditLink { items: Movement[]; settlement: Movement | null }

export const getCreditLink = (id: number) =>
  api.get<CreditLink>(`/movements/${id}/credit-link`).then(r => r.data)

export const getMovement = (id: number) =>
  api.get<Movement>(`/movements/${id}`).then(r => r.data)

export const createMovement = (data: Omit<Movement, 'id' | 'dinero' | 'label' | 'color' | 'files'>) =>
  api.post<Movement>('/movements', data).then(r => r.data)

export const updateMovement = (id: number, data: Partial<Movement>) =>
  api.put<Movement>(`/movements/${id}`, data).then(r => r.data)

export const deleteMovement = (id: number) =>
  api.delete(`/movements/${id}`)

export const uploadMovementFile = async (movementId: number, file: File): Promise<void> => {
  const form = new FormData()
  form.append('files', file)
  await api.post(`/movements/${movementId}/files`, form)
}

export const deleteMovementFile = (fileId: number): Promise<void> =>
  api.delete(`/movements/files/${fileId}`).then(() => undefined)

export const movementFileDownloadUrl = (fileId: number) =>
  apiUrl(`/movements/files/${fileId}/download`)
