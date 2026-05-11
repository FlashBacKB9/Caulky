import api from './client'

export interface AuditLogEntry {
  id: number
  created_at: string
  entity_type: string
  entity_id: number | null
  action: string
  summary: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

export const getAuditLog = (params?: { limit?: number; offset?: number }) =>
  api.get<AuditLogEntry[]>('/audit-log', { params }).then(r => r.data)

export const clearAuditLog = () =>
  api.delete('/audit-log')
