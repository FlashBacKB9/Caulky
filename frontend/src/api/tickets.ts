import api from './client'

export interface TicketItem {
  name: string
  qty?: number
  unit?: string
  price?: number   // unit price; amount = qty × price
  amount: number   // line total (used for financial calculations)
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
  generated_movements?: { food?: number; supplies?: number; combined?: number } | null
  ocr_source?: string | null
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

export const rescanTicket = (id: number, source: 'gemini' | 'mistral', model?: string): Promise<Ticket> =>
  api.post<Ticket>(`/tickets/${id}/rescan`, { source, model }).then(r => r.data)

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

export const updateTicketMeta = (
  id: number,
  patch: { store_name?: string; ticket_date?: string },
): Promise<Ticket> =>
  api.patch<Ticket>(`/tickets/${id}/meta`, patch).then(r => r.data)

export const attachTicketToMovement = (
  ticketId: number,
  movementId: number,
  mode: 'food' | 'supplies' | 'combined',
): Promise<void> =>
  api.post(`/tickets/${ticketId}/attach/${movementId}`, { mode }).then(() => undefined)

export interface TicketOcrDebug {
  text: string
  header_text: string | null
  metadata_text: string | null
  lines: string[]
  preprocessed_image: string | null
}

export const getTicketOcrDebug = (id: number): Promise<TicketOcrDebug> =>
  api.get<TicketOcrDebug>(`/tickets/${id}/ocr-text`).then(r => r.data)
