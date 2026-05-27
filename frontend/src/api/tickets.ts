import api from './client'

export interface TicketItem {
  name: string
  amount: number
  category: string
}

export interface Ticket {
  id: number
  original_name: string
  mime_type: string
  store_name: string | null
  ticket_date: string | null
  total: number | null
  items: TicketItem[]
  categories: Record<string, number>
  created_at: string
}

export const analyzeTicket = async (file: File): Promise<Ticket> => {
  const form = new FormData()
  form.append('file', file)
  const r = await api.post<Ticket>('/tickets/analyze', form)
  return r.data
}

export const getTickets = (): Promise<Ticket[]> =>
  api.get<Ticket[]>('/tickets').then(r => r.data)

export const updateTicketItems = (id: number, items: TicketItem[]): Promise<Ticket> =>
  api.patch<Ticket>(`/tickets/${id}/items`, { items }).then(r => r.data)

export const deleteTicket = (id: number): Promise<void> =>
  api.delete(`/tickets/${id}`).then(() => undefined)

export interface TicketToMovementResult {
  movement_id: number
  amount: number
  name: string
}

export const createMovementFromTicket = (
  ticketId: number,
  mode: 'food' | 'supplies' | 'combined',
  typeId: number,
  movementDate?: string,
): Promise<TicketToMovementResult> =>
  api.post(`/tickets/${ticketId}/to-movement`, {
    mode,
    type_id: typeId,
    movement_date: movementDate ?? null,
  }).then(r => r.data)

export const ticketFileUrl = (id: number) => `/api/tickets/${id}/file`
