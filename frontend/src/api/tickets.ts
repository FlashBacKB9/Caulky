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

export const ticketFileUrl = (id: number) => `/api/tickets/${id}/file`
