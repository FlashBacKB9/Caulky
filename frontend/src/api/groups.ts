import api from './client'

export interface Group {
  id: number
  name: string
  color: string
  initial_balance?: number | null
  budget?: number | null
  is_total?: boolean
}

export const getGroups = (): Promise<Group[]> => api.get<Group[]>('/groups').then(r => r.data)
export const createGroup = (data: Omit<Group, 'id'>) => api.post<Group>('/groups/', data).then(r => r.data)
export const updateGroup = (id: number, data: Omit<Group, 'id'>) => api.put<Group>(`/groups/${id}`, data).then(r => r.data)
export const deleteGroup = (id: number) => api.delete(`/groups/${id}`)
