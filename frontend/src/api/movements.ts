import api from './client'

export interface MovementFile {
  id: number
  original_name: string
  mime_type: string
  created_at: string
}

export interface Movement {
  id: number
  name: string
  money: number
  date: string
  bank_date?: string
  movement_type_id?: number
  account_id?: number
  paid: boolean
  no_count: boolean
  notes?: string
  dinero: number
  label: string
  color: string
  files: MovementFile[]
}

export const getMovements = (params?: { year?: number; month?: number; unassigned?: boolean }) =>
  api.get<Movement[]>('/movements', { params }).then(r => r.data)

export const getMovement = (id: number) =>
  api.get<Movement>(`/movements/${id}`).then(r => r.data)

export const createMovement = (data: Omit<Movement, 'id' | 'dinero' | 'label' | 'color' | 'files'>) =>
  api.post<Movement>('/movements', data).then(r => r.data)

export const updateMovement = (id: number, data: Partial<Movement>) =>
  api.put<Movement>(`/movements/${id}`, data).then(r => r.data)

export const deleteMovement = (id: number) =>
  api.delete(`/movements/${id}`)
