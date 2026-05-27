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

export const analyzeTicket = (file: File): Promise<Ticket> => {
  const form = new FormData()
  form.append('file', file)
  return api.post<Ticket>('/tickets/analyze', form).then(r => r.data)
}

export const getTickets = (): Promise<Ticket[]> =>
  api.get<Ticket[]>('/tickets').then(r => r.data)

export const deleteTicket = (id: number): Promise<void> =>
  api.delete(`/tickets/${id}`).then(() => undefined)
