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
  is_transfer?: boolean
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

export const uploadMovementFile = async (movementId: number, file: File): Promise<void> => {
  const form = new FormData()
  form.append('files', file)
  await api.post(`/movements/${movementId}/files`, form)
}

export const deleteMovementFile = (fileId: number): Promise<void> =>
  api.delete(`/movements/files/${fileId}`).then(() => undefined)

export const movementFileDownloadUrl = (fileId: number) =>
  `/api/movements/files/${fileId}/download`
